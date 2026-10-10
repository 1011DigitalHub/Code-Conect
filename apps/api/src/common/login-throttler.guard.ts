import { Injectable } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthController } from '../auth/auth.controller.js';
import { OidcController } from '../auth/oidc/oidc.controller.js';

// AuthController.login and OidcController.link both end up checking a
// password against the same local account (OidcService.linkAccount calls
// the same verifyUserPassword as AuthService.signIn) — left alone, each
// @Throttle({ default: LOGIN_THROTTLE }) handler gets its OWN bucket
// (ThrottlerGuard's default generateKey keys by class+handler+tracker), so
// an attacker gets 5 guesses/min against each independently: 10/min total
// against one account's password, not 5. Obtaining a linking_token to use
// against /link costs the attacker nothing — it's minted for any email on
// the password-collision branch regardless of email_verified (see
// OidcService.resolveIdentity's own comment on why that branch doesn't need
// the claim; password confirmation is the proof, not the provider's claim).
//
// This guard replaces the global ThrottlerGuard (see app.module.ts) rather
// than being layered on top of it per-route — AuthController/
// UsersController's own comments explain why: @UseGuards(ThrottlerGuard) on
// top of the already-global one runs it twice per request and
// double-counts. Overriding generateKey here is the only way to merge two
// routes' buckets without reintroducing that bug.
//
// The actual method references (PR #28's own second round of review), not
// name strings: context.getHandler() returns the real handler function
// (Function, same as ExecutionContext's own declared return type), so
// comparing it by identity against AuthController.prototype.login itself
// closes two gaps a name-string comparison left open — an unrelated class
// that happened to also be named 'AuthController' with a 'login' method
// would no longer collide, and a decorator that ever wrapped/replaced the
// method (none here does — @Throttle/@Public only attach Reflector
// metadata via SetMetadata, they don't replace the function) would no
// longer silently stop matching. Renaming either method still fails to
// compile here, same as the name-string version did.
//
// Reading these at module-evaluation time means a future import cycle
// through this file (none exists today — neither controller imports
// anything that leads back here) would risk a TDZ ReferenceError on
// AuthController/OidcController instead of failing more legibly elsewhere.
// Worth knowing if a cycle ever gets introduced, not worth guarding against
// with no cycle to guard against yet.
//
// oxlint's unbound-method warning fires on both prototype references below
// (and on the matching ones in this file's own spec) — it's checking for
// exactly the opposite usage of what's happening here: these are compared
// for identity, never invoked, so there is no `this` to lose.
const SHARED_PASSWORD_GUESS_HANDLERS: ReadonlySet<Function> = new Set([
  AuthController.prototype.login,
  OidcController.prototype.link,
]);

@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected generateKey(context: ExecutionContext, suffix: string, name: string): string {
    const handler = context.getHandler();
    const bucket = SHARED_PASSWORD_GUESS_HANDLERS.has(handler)
      ? 'shared-password-guess'
      : `${context.getClass().name}.${handler.name}`;
    return `${bucket}-${name}-${suffix}`;
  }
}
