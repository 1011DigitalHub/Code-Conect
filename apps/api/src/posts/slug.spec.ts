import { RESERVED_SLUGS, SLUG_MAX_LENGTH, assertSlugFormat, slugify, uniqueSlug } from './slug.js';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('React Hooks na pratica')).toBe('react-hooks-na-pratica');
  });

  it('folds accents instead of dropping the letter', () => {
    expect(slugify('Componentes React na prática')).toBe(
      'componentes-react-na-pratica',
    );
    expect(slugify('Introdução à inversão de controle')).toBe(
      'introducao-a-inversao-de-controle',
    );
  });

  it('collapses punctuation into single hyphens and trims the ends', () => {
    expect(slugify('Olá, Mundo! 2026')).toBe('ola-mundo-2026');
    expect(slugify('  --Teste--  ')).toBe('teste');
  });

  it('clamps to the column width without leaving a trailing hyphen', () => {
    const slug = slugify(`${'a'.repeat(SLUG_MAX_LENGTH - 1)} b`);
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('falls back to "post" when the title leaves nothing usable', () => {
    expect(slugify('!!!')).toBe('post');
    expect(slugify('日本語')).toBe('post');
  });
});

describe('uniqueSlug', () => {
  const free = () => Promise.resolve(false);

  it('returns the plain slug when it is free', async () => {
    expect(await uniqueSlug('Um post', free)).toBe('um-post');
  });

  it('suffixes a reserved slug so it cannot shadow a route', async () => {
    expect(RESERVED_SLUGS.has('novo')).toBe(true);
    expect(await uniqueSlug('Novo', free)).toBe('novo-post');
  });

  it('suffixes until it finds a free slug', async () => {
    const existing = new Set(['um-post', 'um-post-2']);
    expect(await uniqueSlug('Um post', (s) => Promise.resolve(existing.has(s)))).toBe(
      'um-post-3',
    );
  });

  it('keeps the suffixed slug inside the column width', async () => {
    const title = 'a'.repeat(SLUG_MAX_LENGTH + 20);
    const existing = new Set([slugify(title)]);
    const slug = await uniqueSlug(title, (s) => Promise.resolve(existing.has(s)));
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(slug.endsWith('-2')).toBe(true);
  });
});

describe('assertSlugFormat', () => {
  it('accepts every shape slugify()/uniqueSlug() can actually produce', () => {
    for (const slug of ['um-post', 'novo-post', 'um-post-3', 'post', 'a']) {
      expect(() => assertSlugFormat(slug)).not.toThrow();
    }
  });

  it.each([
    ['Bad Slug', 'uppercase and a space'],
    ['tem--hifen-duplo', 'a double hyphen'],
    ['-comeca-com-hifen', 'a leading hyphen'],
    ['termina-com-hifen-', 'a trailing hyphen'],
    ['tem_underscore', 'an underscore'],
    ['', 'an empty string'],
    ['a'.repeat(SLUG_MAX_LENGTH + 1), 'longer than the column width'],
  ])('rejects %j (%s)', (slug) => {
    expect(() => assertSlugFormat(slug)).toThrow(/does not match the safe slug format/);
  });

  it('never lets the rejected slug forge extra log lines', () => {
    let message = '';
    try {
      assertSlugFormat('bad\nslug\rwith "quotes"');
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).not.toContain('\n');
    expect(message).not.toContain('\r');
    expect(message).toContain('bad\\nslug\\rwith \\"quotes\\"');
  });
});
