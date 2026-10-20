import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PostArticle, type PostArticlePost } from './PostArticle'
import { renderWithRouter } from '../../../test/renderWithRouter'
import { expectNoA11yViolations } from '../../../test/axe'

const now = new Date('2026-10-05T12:00:00.000Z')

const post: PostArticlePost = {
  slug: 'componentes-react-na-pratica',
  title: 'Componentes React na prática',
  content: 'Primeiro parágrafo.\n\nSegundo parágrafo.\n\nTerceiro parágrafo.',
  thumbnailUrl: null,
  createdAt: '2026-10-04T12:00:00.000Z',
  author: { name: 'Ana Souza' },
  likeCount: 4,
  commentCount: 2,
  likedByMe: false,
}

describe('PostArticle', () => {
  it('uses the post title as the page h1', () => {
    renderWithRouter(
      <PostArticle post={post} authenticated={false} onToggleLike={vi.fn()} now={now} />,
    )

    expect(screen.getByRole('heading', { level: 1, name: post.title })).toBeInTheDocument()
  })

  it('splits the body on blank lines into paragraphs', () => {
    renderWithRouter(
      <PostArticle post={post} authenticated={false} onToggleLike={vi.fn()} now={now} />,
    )

    expect(screen.getByText('Primeiro parágrafo.')).toBeInTheDocument()
    expect(screen.getByText('Segundo parágrafo.')).toBeInTheDocument()
    expect(screen.getByText('Terceiro parágrafo.')).toBeInTheDocument()
  })

  it('renders stored markup as text, never as HTML', () => {
    renderWithRouter(
      <PostArticle
        post={{ ...post, content: 'Um <script>alert(1)</script> no corpo do post.' }}
        authenticated={false}
        onToggleLike={vi.fn()}
        now={now}
      />,
    )

    expect(document.querySelector('script')).toBeNull()
    expect(
      screen.getByText('Um <script>alert(1)</script> no corpo do post.'),
    ).toBeInTheDocument()
  })

  it('describes the cover when there is one, because nothing beside it names the post', () => {
    renderWithRouter(
      <PostArticle
        post={{ ...post, thumbnailUrl: '/posts/capa.webp' }}
        authenticated={false}
        onToggleLike={vi.fn()}
        now={now}
      />,
    )

    expect(
      screen.getByRole('img', { name: `Capa do post ${post.title}` }),
    ).toBeInTheDocument()
  })

  it('shows the placeholder when there is no cover', () => {
    const { container } = renderWithRouter(
      <PostArticle post={post} authenticated={false} onToggleLike={vi.fn()} now={now} />,
    )

    expect(container.querySelector('img')).toBeNull()
  })

  it('toggles the like when signed in', async () => {
    const onToggleLike = vi.fn()
    renderWithRouter(
      <PostArticle post={post} authenticated onToggleLike={onToggleLike} now={now} />,
    )

    await userEvent.click(screen.getByRole('button'))

    expect(onToggleLike).toHaveBeenCalledOnce()
  })

  it('invites the visitor to log in instead of offering a dead control', () => {
    renderWithRouter(
      <PostArticle post={post} authenticated={false} onToggleLike={vi.fn()} now={now} />,
    )

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Entre para curtir/ })).toBeInTheDocument()
  })

  it('renders CodeBlock and "Código:" heading when post.code is set', () => {
    renderWithRouter(
      <PostArticle
        post={{ ...post, code: 'const x = 1' }}
        authenticated={false}
        onToggleLike={vi.fn()}
        now={now}
      />,
    )

    expect(screen.getByRole('heading', { level: 2, name: 'Código:' })).toBeInTheDocument()
    expect(screen.getByText('const x = 1')).toBeInTheDocument()
  })

  it('does not render the code section when post.code is absent', () => {
    renderWithRouter(
      <PostArticle post={post} authenticated={false} onToggleLike={vi.fn()} now={now} />,
    )

    expect(screen.queryByRole('heading', { level: 2, name: 'Código:' })).not.toBeInTheDocument()
  })

  it('shows the comment count in the action bar', () => {
    renderWithRouter(
      <PostArticle post={post} authenticated={false} onToggleLike={vi.fn()} now={now} />,
    )

    expect(screen.getByLabelText('2 comentários')).toBeInTheDocument()
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = renderWithRouter(
      <PostArticle post={post} authenticated onToggleLike={vi.fn()} now={now} />,
    )

    await expectNoA11yViolations(container)
  })
})
