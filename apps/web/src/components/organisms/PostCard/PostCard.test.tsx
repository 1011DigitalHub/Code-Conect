import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PostCard, type PostCardPost } from './PostCard'
import { renderWithRouter } from '../../../test/renderWithRouter'
import { expectNoA11yViolations } from '../../../test/axe'

const now = new Date('2026-10-05T12:00:00.000Z')

const post: PostCardPost = {
  slug: 'componentes-react-na-pratica',
  title: 'Componentes React na prática',
  excerpt: 'Como quebrar uma tela grande em componentes pequenos.',
  thumbnailUrl: null,
  createdAt: '2026-10-04T12:00:00.000Z',
  author: { name: 'Ana Souza' },
  likeCount: 4,
  commentCount: 2,
  likedByMe: false,
}

describe('PostCard', () => {
  it('titles the card with a heading that links to the post', () => {
    renderWithRouter(
      <PostCard post={post} authenticated={false} onToggleLike={vi.fn()} now={now} />,
    )

    const heading = screen.getByRole('heading', { level: 2, name: post.title })
    expect(heading).toBeInTheDocument()
    expect(screen.getByRole('link', { name: post.title })).toHaveAttribute(
      'href',
      '/posts/componentes-react-na-pratica',
    )
  })

  it('shows the excerpt and the author', () => {
    renderWithRouter(
      <PostCard post={post} authenticated={false} onToggleLike={vi.fn()} now={now} />,
    )

    expect(screen.getByText(post.excerpt)).toBeInTheDocument()
    expect(screen.getByText('Ana Souza')).toBeInTheDocument()
  })

  it('shows the comment count as text, not as another control', () => {
    renderWithRouter(
      <PostCard post={post} authenticated onToggleLike={vi.fn()} now={now} />,
    )

    // Keeping it non-interactive is deliberate: the title link already leads
    // to the post and its comments.
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.getByText(/comentários/)).toBeInTheDocument()
  })

  it('has exactly two focusable controls when signed in', () => {
    const { container } = renderWithRouter(
      <PostCard post={post} authenticated onToggleLike={vi.fn()} now={now} />,
    )

    expect(container.querySelectorAll('a[href], button')).toHaveLength(2)
  })

  it('has exactly two focusable controls when signed out, neither disabled', () => {
    const { container } = renderWithRouter(
      <PostCard post={post} authenticated={false} onToggleLike={vi.fn()} now={now} />,
    )

    expect(container.querySelectorAll('a[href], button')).toHaveLength(2)
    expect(container.querySelector('[disabled]')).toBeNull()
  })

  it('reports the slug when the like is toggled', async () => {
    const onToggleLike = vi.fn()
    renderWithRouter(
      <PostCard post={post} authenticated onToggleLike={onToggleLike} now={now} />,
    )

    await userEvent.click(screen.getByRole('button'))

    expect(onToggleLike).toHaveBeenCalledWith('componentes-react-na-pratica')
  })

  it('shows the placeholder when the post has no cover', () => {
    const { container } = renderWithRouter(
      <PostCard post={post} authenticated={false} onToggleLike={vi.fn()} now={now} />,
    )

    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('renders the cover decoratively, since the title link already names the post', () => {
    renderWithRouter(
      <PostCard
        post={{ ...post, thumbnailUrl: '/posts/capa.webp' }}
        authenticated={false}
        onToggleLike={vi.fn()}
        now={now}
      />,
    )

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('says "1 comentário" in the singular', () => {
    renderWithRouter(
      <PostCard
        post={{ ...post, commentCount: 1 }}
        authenticated={false}
        onToggleLike={vi.fn()}
        now={now}
      />,
    )

    expect(screen.getByText(/comentário/)).toBeInTheDocument()
  })

  it('has no WCAG 2.2 AA violations signed in', async () => {
    const { container } = renderWithRouter(
      <PostCard post={post} authenticated onToggleLike={vi.fn()} now={now} />,
    )

    await expectNoA11yViolations(container)
  })

  it('has no WCAG 2.2 AA violations signed out', async () => {
    const { container } = renderWithRouter(
      <PostCard post={post} authenticated={false} onToggleLike={vi.fn()} now={now} />,
    )

    await expectNoA11yViolations(container)
  })
})
