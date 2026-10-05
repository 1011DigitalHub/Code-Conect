import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import { MemoryRouter, Route, Routes } from 'react-router'
import { getMe } from '../../api/auth'
import { createComment, listComments } from '../../api/comments'
import { getPost } from '../../api/posts'
import { expectNoA11yViolations } from '../../test/axe'
import { PostPage } from './PostPage'

vi.mock('../../api/auth', () => ({ getMe: vi.fn(), logout: vi.fn() }))
vi.mock('../../api/posts', () => ({
  getPost: vi.fn(),
  likePost: vi.fn(),
  unlikePost: vi.fn(),
}))
vi.mock('../../api/comments', () => ({
  listComments: vi.fn(),
  createComment: vi.fn(),
}))

function apiError(status: number) {
  const config = { headers: new AxiosHeaders() }
  const response = { data: {}, status, statusText: '', headers: {}, config } as AxiosResponse
  return new AxiosError('failed', AxiosError.ERR_BAD_REQUEST, config, null, response)
}

const post = {
  slug: 'componentes-react-na-pratica',
  title: 'Componentes React na prática',
  excerpt: 'Como quebrar uma tela grande em componentes pequenos e reaproveitáveis.',
  content: 'Primeiro parágrafo.\n\nSegundo parágrafo.',
  thumbnailUrl: null,
  createdAt: '2026-10-04T12:00:00.000Z',
  author: { id: 1, name: 'Ana Souza', self: '/users/1' },
  likeCount: 4,
  commentCount: 1,
  likedByMe: false,
  links: {
    self: '/posts/componentes-react-na-pratica',
    comments: '/posts/componentes-react-na-pratica/comments',
    like: '/posts/componentes-react-na-pratica/like',
    author: '/users/1',
  },
}

const emptyComments = {
  data: [],
  pagination: { page: 1, perPage: 9, total: 0, totalPages: 1 },
  links: { self: '', next: null, prev: null },
}

function renderPostRoutes() {
  return render(
    <MemoryRouter initialEntries={['/posts/componentes-react-na-pratica']}>
      <Routes>
        <Route path="/posts/:slug" element={<PostPage />} />
        <Route path="/" element={<p>Tela do feed</p>} />
        <Route path="/login" element={<p>Tela de login</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PostPage', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('renders the post and its comments', async () => {
    vi.mocked(getMe).mockRejectedValue(apiError(401))
    vi.mocked(getPost).mockResolvedValue(post)
    vi.mocked(listComments).mockResolvedValue({
      data: [
        {
          id: 1,
          body: 'Muito bom!',
          createdAt: '2026-10-05T10:00:00.000Z',
          author: { id: 2, name: 'Bruno Lima', self: '/users/2' },
          links: { self: '/posts/x/comments/1', post: '/posts/x' },
        },
      ],
      pagination: { page: 1, perPage: 9, total: 1, totalPages: 1 },
      links: { self: '', next: null, prev: null },
    })

    renderPostRoutes()

    expect(
      await screen.findByRole('heading', { level: 1, name: post.title }),
    ).toBeInTheDocument()
    expect(await screen.findByText('Muito bom!')).toBeInTheDocument()
  })

  it('shows a not-found state for an unknown slug, with no redirect', async () => {
    vi.mocked(getMe).mockRejectedValue(apiError(401))
    vi.mocked(getPost).mockRejectedValue(apiError(404))
    vi.mocked(listComments).mockResolvedValue(emptyComments)

    renderPostRoutes()

    expect(await screen.findByText('Post não encontrado')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar para o feed' })).toHaveAttribute(
      'href',
      '/',
    )
    expect(screen.queryByText('Tela do feed')).not.toBeInTheDocument()
  })

  it('shows the CTA to log in instead of the comment form when signed out', async () => {
    vi.mocked(getMe).mockRejectedValue(apiError(401))
    vi.mocked(getPost).mockResolvedValue(post)
    vi.mocked(listComments).mockResolvedValue(emptyComments)

    renderPostRoutes()

    expect(await screen.findByRole('link', { name: 'Entre para comentar' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Seu comentário')).not.toBeInTheDocument()
  })

  it('submits a comment and it appears in the list', async () => {
    vi.mocked(getMe).mockResolvedValue({
      id: 2,
      name: 'Bruno Lima',
      email: 'bruno@exemplo.com',
      createdAt: '2026-10-02T12:00:00.000Z',
      links: { self: '/users/2' },
    })
    vi.mocked(getPost).mockResolvedValue(post)
    vi.mocked(listComments).mockResolvedValue(emptyComments)
    vi.mocked(createComment).mockResolvedValue({
      id: 1,
      body: 'Muito bom!',
      createdAt: '2026-10-05T12:00:00.000Z',
      author: { id: 2, name: 'Bruno Lima', self: '/users/2' },
      links: { self: '/posts/x/comments/1', post: '/posts/x' },
    })

    renderPostRoutes()
    const field = await screen.findByLabelText('Seu comentário')
    await userEvent.type(field, 'Muito bom!')
    await userEvent.click(screen.getByRole('button', { name: 'Comentar' }))

    await waitFor(() => expect(screen.getByText('Muito bom!')).toBeInTheDocument())
    expect(createComment).toHaveBeenCalledWith('componentes-react-na-pratica', {
      body: 'Muito bom!',
    })
  })

  it('sets the page title to the post title and the description to the excerpt', async () => {
    vi.mocked(getMe).mockRejectedValue(apiError(401))
    vi.mocked(getPost).mockResolvedValue(post)
    vi.mocked(listComments).mockResolvedValue(emptyComments)

    renderPostRoutes()
    await screen.findByRole('heading', { level: 1, name: post.title })

    // usePageMeta runs in its own effect, which can still be pending in the
    // tick right after the heading commits — first with the loading
    // fallback title, then again with the post's real title once data
    // arrives. waitFor lets both flush before asserting the final value.
    await waitFor(() => expect(document.title).toBe(`${post.title} | Code Connect`))
    expect(
      document.querySelector('meta[name="description"]')?.getAttribute('content'),
    ).toBe(post.excerpt)
  })

  it('has no WCAG 2.2 AA violations', async () => {
    vi.mocked(getMe).mockRejectedValue(apiError(401))
    vi.mocked(getPost).mockResolvedValue(post)
    vi.mocked(listComments).mockResolvedValue(emptyComments)

    const { container } = renderPostRoutes()
    await screen.findByRole('heading', { level: 1, name: post.title })

    await expectNoA11yViolations(container)
  })
})
