import { buildCollectionLinks, buildPagination } from './pagination.js';

describe('buildPagination', () => {
  it('rounds the page count up', () => {
    expect(buildPagination({ page: 1, perPage: 9, total: 10 })).toEqual({
      page: 1,
      perPage: 9,
      total: 10,
      totalPages: 2,
    });
  });

  it('reports one page when there is nothing to show', () => {
    // Page 1 of 1 keeps `prev`/`next` null instead of making page 1 look
    // out of range on an empty collection.
    expect(buildPagination({ page: 1, perPage: 9, total: 0 }).totalPages).toBe(1);
  });

  it('reports one page when the total fits exactly', () => {
    expect(buildPagination({ page: 1, perPage: 9, total: 9 }).totalPages).toBe(1);
  });
});

describe('buildCollectionLinks', () => {
  it('omits prev on the first page', () => {
    const links = buildCollectionLinks('/posts', { perPage: 9 }, 1, 3);
    expect(links).toEqual({
      self: '/posts?perPage=9&page=1',
      next: '/posts?perPage=9&page=2',
      prev: null,
    });
  });

  it('omits next on the last page', () => {
    const links = buildCollectionLinks('/posts', { perPage: 9 }, 3, 3);
    expect(links.next).toBeNull();
    expect(links.prev).toBe('/posts?perPage=9&page=2');
  });

  it('omits both when there is a single page', () => {
    const links = buildCollectionLinks('/posts', { perPage: 9 }, 1, 1);
    expect(links.next).toBeNull();
    expect(links.prev).toBeNull();
  });

  it('keeps the search term on every link and encodes it', () => {
    const links = buildCollectionLinks(
      '/posts',
      { q: 'react hooks & cia', perPage: 9 },
      1,
      2,
    );
    expect(links.self).toContain('q=react+hooks+%26+cia');
    expect(links.next).toContain('q=react+hooks+%26+cia');
  });

  it('drops undefined and empty parameters', () => {
    const links = buildCollectionLinks(
      '/posts',
      { q: '', perPage: 9, authorId: undefined },
      1,
      1,
    );
    expect(links.self).toBe('/posts?perPage=9&page=1');
  });
});
