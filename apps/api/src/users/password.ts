import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

type ScryptParams = { N: number; r: number; p: number };

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptParams & { maxmem: number },
) => Promise<Buffer>;

const KEY_LENGTH = 64;

// OWASP's current minimum (2023+) for interactive logins is N >= 2^17; r/p
// stay at the conventional defaults. Node refuses these parameters with its
// own default maxmem (32 MiB), since N=2^17,r=8 needs 128 * N * r bytes
// (128 MiB) of working memory — raised here with headroom.
const CURRENT_PARAMS: ScryptParams = { N: 2 ** 17, r: 8, p: 1 };
const MAX_MEM = 256 * 1024 * 1024;

// Node's own scrypt defaults, from before this format existed. Hashes
// stored as the legacy, unversioned "<saltHex>:<hashHex>" (no params, no
// "scrypt$" prefix) used these; verifyPassword still accepts them so
// existing accounts keep working, and shouldRehash() flags them for
// replacement on the next successful login.
const LEGACY_PARAMS: ScryptParams = { N: 16384, r: 8, p: 1 };

function formatHash(params: ScryptParams, salt: Buffer, hash: Buffer): string {
  return `scrypt$N=${params.N},r=${params.r},p=${params.p}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

// Stored as "scrypt$N=<N>,r=<r>,p=<p>$<saltHex>$<hashHex>", so the cost can
// be raised again later without invalidating every existing hash — the
// unversioned format this replaced could not do that.
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LENGTH, {
    ...CURRENT_PARAMS,
    maxmem: MAX_MEM,
  });
  return formatHash(CURRENT_PARAMS, salt, hash);
}

interface ParsedHash {
  params: ScryptParams;
  salt: Buffer;
  hash: Buffer;
}

function parseVersioned(stored: string): ParsedHash | undefined {
  const [, paramsPart, saltHex, hashHex] = stored.split('$');
  if (!paramsPart || !saltHex || !hashHex) return undefined;

  const raw: Partial<Record<keyof ScryptParams, number>> = {};
  for (const pair of paramsPart.split(',')) {
    const [key, value] = pair.split('=');
    if (key !== 'N' && key !== 'r' && key !== 'p') continue;
    raw[key] = Number(value);
  }
  const { N, r, p } = raw;
  if (
    N === undefined ||
    r === undefined ||
    p === undefined ||
    !Number.isInteger(N) ||
    !Number.isInteger(r) ||
    !Number.isInteger(p)
  ) {
    return undefined;
  }
  return {
    params: { N, r, p },
    salt: Buffer.from(saltHex, 'hex'),
    hash: Buffer.from(hashHex, 'hex'),
  };
}

function parseLegacy(stored: string): ParsedHash | undefined {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return undefined;
  return {
    params: LEGACY_PARAMS,
    salt: Buffer.from(saltHex, 'hex'),
    hash: Buffer.from(hashHex, 'hex'),
  };
}

function parseStored(stored: string): ParsedHash | undefined {
  return stored.startsWith('scrypt$') ? parseVersioned(stored) : parseLegacy(stored);
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parsed = parseStored(stored);
  if (!parsed) return false;
  const actual = await scryptAsync(password, parsed.salt, parsed.hash.length, {
    ...parsed.params,
    maxmem: MAX_MEM,
  });
  return parsed.hash.length === actual.length && timingSafeEqual(parsed.hash, actual);
}

// A fixed, valid (but unreachable — no account could ever match it) hash in
// the current format, for AuthService to compare an unknown email against.
// Without this, verifyPassword is only ever called when the email exists,
// so an unknown email returns a 401 measurably faster than a wrong
// password: the email itself becomes a timing side-channel even though the
// error message is identical for both. Precomputed offline, not generated
// at import time, so it costs nothing beyond a fixed string literal.
export const DUMMY_HASH =
  'scrypt$N=131072,r=8,p=1$9fc2a80d057f7a9e3c9eae1f444070b7$d0dbf607256887c7beaa63154eb99b379bd3b7daa2f3d6e3227c261c3ceb759202faef05c17a33896d2c51de555cd33c084183a58142cd83d474daf1a3798831';

// Shared by AuthService.signIn and OidcService.linkAccount: both need the
// exact same timing-safe shape — a null/missing passwordHash (an unknown
// email, or a real account that was created via OIDC and has no local
// password at all) falls through to DUMMY_HASH, the same way a wrong
// password does, so neither case answers measurably faster nor differently
// than a correct email with a wrong password.
export async function verifyUserPassword(
  user: { passwordHash: string | null } | null,
  password: string,
): Promise<boolean> {
  return verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
}

// True when `stored` isn't using the current cost parameters — either the
// legacy unversioned format or an older, weaker versioned one. The caller
// (AuthService, after a successful login) re-hashes and persists the
// result, so accounts migrate to the current cost without a forced reset.
export function shouldRehash(stored: string): boolean {
  const parsed = parseStored(stored);
  if (!parsed) return true;
  return (
    parsed.params.N !== CURRENT_PARAMS.N ||
    parsed.params.r !== CURRENT_PARAMS.r ||
    parsed.params.p !== CURRENT_PARAMS.p
  );
}
