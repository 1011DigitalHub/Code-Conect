import { screen } from '@testing-library/react'
import { PostList } from './PostList'
import type { PostCardPost } from '../PostCard'
import { renderWithRouter } from '../../../test/renderWithRouter'
import { expectNoA11yViolations } from '../../../test/axe'

const now = new Date('2026-10-05T12:00:00.000Z')

function post(index: number): PostCardPost {
  return {
    slug: `post-${index}`,
    // Unique titles matter: the per-card controls are named after their post.
    title: `Post número ${index}`,
    excerpt: 'Um resumo qualquer para o card do feed.',
    thumbnailUrl: '/posts/capa.webp',
    createdAt: '2026-10-04T12:00:00.000Z',
    author: { name: 'Ana Souza' },
    likeCount: index,
    commentCount: 0,
    likedByMe: false,
  }
}

const posts = Array.from({ length: 5 }, (_, index) => post(index + 1))

describe('PostList', () => {
  it('renders a named list with one item per post', () => {
    renderWithRouter(
      <PostList posts={posts} authenticated={false} onToggleLike={vi.fn()} now={now} />,
    )

    expect(screen.getByRole('list', { name: 'Posts do feed' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
  })

  it('gives high fetch priority to exactly one image, the LCP candidate', () => {
    const { container } = renderWithRouter(
      <PostList posts={posts} authenticated={false} onToggleLike={vi.fn()} now={now} />,
    )

    const prioritised = container.querySelectorAll('img[fetchpriority="high"]')
    expect(prioritised).toHaveLength(1)
    expect(prioritised[0]).toHaveAttribute('src', '/posts/capa.webp')
  })

  it('loads the first three eagerly and lazies the rest', () => {
    const { container } = renderWithRouter(
      <PostList posts={posts} authenticated={false} onToggleLike={vi.fn()} now={now} />,
    )

    const images = Array.from(container.querySelectorAll('img'))
    // loading="lazy" on an above-the-fold image can itself delay the LCP.
    expect(images.slice(0, 3).map((image) => image.getAttribute('loading'))).toEqual([
      null,
      null,
      null,
    ])
    expect(images.slice(3).map((image) => image.getAttribute('loading'))).toEqual([
      'lazy',
      'lazy',
    ])
  })

  it('marks only the pending card as in flight', () => {
    renderWithRouter(
      <PostList
        posts={posts}
        authenticated
        pendingSlug="post-2"
        onToggleLike={vi.fn()}
        now={now}
      />,
    )

    const disabled = screen
      .getAllByRole('button')
      .filter((button) => (button as HTMLButtonElement).disabled)
    expect(disabled).toHaveLength(1)
    expect(disabled[0]?.getAttribute('aria-label')).toContain('Post número 2')
  })

  it('renders an empty list without complaint', () => {
    renderWithRouter(
      <PostList posts={[]} authenticated={false} onToggleLike={vi.fn()} now={now} />,
    )

    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('gives every card control a distinct accessible name', () => {
    const { container } = renderWithRouter(
      <PostList posts={posts} authenticated onToggleLike={vi.fn()} now={now} />,
    )

    // The browser accessibility suite tabs through every control and collects
    // their names into a Set, so duplicates would make it fail.
    const names = Array.from(container.querySelectorAll('a[href], button')).map(
      (control) => control.getAttribute('aria-label') ?? control.textContent?.trim(),
    )
    expect(new Set(names).size).toBe(names.length)
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = renderWithRouter(
      <PostList posts={posts} authenticated onToggleLike={vi.fn()} now={now} />,
    )

    await expectNoA11yViolations(container)
  })

  // A missing author — a null join, a deleted account, any API-shape slip —
  // makes PostCard throw synchronously at `post.author.name` (issue #18).
  // CardErrorBoundary must isolate that one card instead of losing the whole
  // feed. (A malicious post.slug cannot reach this path: PostCard always
  // builds its TextLink href as `/posts/${post.slug}`, and that fixed literal
  // prefix anchors the result to this origin no matter what the slug
  // contains — confirmed by trying every vector TextLink.test.tsx rejects
  // with the prefix prepended, none of which throw or resolve cross-origin.
  // The realistic trigger for a per-card throw is some other malformed field,
  // not slug.)
  it('isolates a single bad card instead of losing the whole feed', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const broken = posts.map((p, index) =>
      index === 2 ? { ...p, author: null as unknown as PostCardPost['author'] } : p,
    )
    renderWithRouter(
      <PostList posts={broken} authenticated={false} onToggleLike={vi.fn()} now={now} />,
    )

    expect(screen.getAllByRole('listitem')).toHaveLength(posts.length - 1)
    expect(screen.queryByText('Post número 3')).not.toBeInTheDocument()
    expect(screen.getByText('Post número 1')).toBeInTheDocument()
    expect(screen.getByText('Post número 5')).toBeInTheDocument()

    vi.mocked(console.error).mockRestore()
  })
})
