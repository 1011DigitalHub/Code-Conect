import { matches } from 'class-validator';

export const SLUG_MAX_LENGTH = 160;

// What slugify()/uniqueSlug() below already guarantee by construction: no
// leading/trailing/double hyphen, nothing outside [a-z0-9-], within the
// column width. Asserted again at the call site (posts.service.ts) as a
// regression guard — if a future change to either function ever breaks that
// invariant, this fails the create instead of persisting a slug that could
// later reach TextLink's own guard as an unexpected throw.
export const SLUG_FORMAT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function assertSlugFormat(slug: string): void {
  if (slug.length > SLUG_MAX_LENGTH || !matches(slug, SLUG_FORMAT)) {
    // JSON.stringify, not raw interpolation: slug reached this point because
    // the invariant it's supposed to satisfy already broke, so it cannot be
    // trusted not to contain control characters — logging it unescaped would
    // let it forge extra lines in whatever reads this log.
    throw new Error(`Generated slug ${JSON.stringify(slug)} does not match the safe slug format`);
  }
}

// Path segments under /posts that are real routes on the web app, so a post
// can never take a slug that would shadow one (a post titled "Novo" would
// otherwise be unreachable behind /posts/novo).
export const RESERVED_SLUGS = new Set(['novo', 'new']);

// Builds a URL-safe slug: accents folded, everything that is not a letter or
// a digit collapsed into a single hyphen, clamped to the column width.
export function slugify(title: string): string {
  const slug = title
    .normalize('NFD')
    // Strip the combining marks that NFD split off, so "prática" folds to
    // "pratica" instead of losing the whole letter.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    // The slice can leave a trailing hyphen behind.
    .replace(/-+$/g, '');

  // A title made only of punctuation or non-Latin script leaves nothing
  // usable; the caller's uniqueness suffix turns this into "post-2" etc.
  return slug || 'post';
}

// Appends the smallest numeric suffix that is free, keeping the result inside
// the column width. `taken` answers "does this slug already exist?".
export async function uniqueSlug(
  title: string,
  taken: (slug: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(title);
  const candidate = RESERVED_SLUGS.has(base) ? `${base}-post` : base;

  if (!(await taken(candidate))) return candidate;

  for (let suffix = 2; ; suffix++) {
    const tail = `-${suffix}`;
    const trimmed = candidate.slice(0, SLUG_MAX_LENGTH - tail.length).replace(/-+$/g, '');
    const next = `${trimmed}${tail}`;
    if (!(await taken(next))) return next;
  }
}
