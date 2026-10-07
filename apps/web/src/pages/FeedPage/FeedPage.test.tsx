import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import { MemoryRouter, Route, Routes } from 'react-router'
import { getSession } from '../../api/auth'
import { likePost, listPosts } from '../../api/posts'
import { expectNoA11yViolations } from '../../test/axe'
import { FeedPage } from './FeedPage'

vi.mock('../../api/auth', () => ({ getSession: vi.fn(), logout: vi.fn() }))
vi.mock('../../api/posts', () => ({
  listPosts: vi.fn(),
  likePost: vi.fn(),
  unlikePost: vi.fn(),
}))

function apiError(status: number) {
  const config = { headers: new AxiosHeaders() }
  const response = { data: {}, status, statusText: '', headers: {}, config } as AxiosResponse
  return new AxiosError('failed', AxiosError.ERR_BAD_REQUEST, config, null, response)
}

function collection(overrides: Record<string, unknown> = {}) {
  return {
    data: [
      {
        slug: 'componentes-react-na-pratica',
        title: 'Componentes React na prática',
        excerpt: 'Como quebrar uma tela grande em componentes pequenos.',
        thumbnailUrl: null,
        createdAt: '2026-10-04T12:00:00.000Z',
        author: { id: 1, name: 'Ana Souza', self: '/users/1' },
        likeCount: 4,
        commentCount: 2,
        likedByMe: false,
        links: {
          self: '/posts/componentes-react-na-pratica',
          comments: '/posts/componentes-react-na-pratica/comments',
          like: '/posts/componentes-react-na-pratica/like',
          author: '/users/1',
        },
      },
    ],
    pagination: { page: 1, perPage: 9, total: 1, totalPages: 1 },
    links: { self: '/posts?page=1', next: null, prev: null },
    ...overrides,
  }
}

function renderFeedRoutes() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<FeedPage />} />
        <Route path="/login" element={<p>Tela de login</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('FeedPage', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('is public: it renders the feed even when the viewer is not logged in', async () => {
    vi.mocked(getSession).mockResolvedValue({ user: null })
    vi.mocked(listPosts).mockResolvedValue(collection())

    renderFeedRoutes()

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Componentes React na prática' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Login' })).toBeInTheDocument()
  })

  it('shows the loading state before the posts arrive', () => {
    vi.mocked(getSession).mockReturnValue(new Promise(() => {}))
    vi.mocked(listPosts).mockReturnValue(new Promise(() => {}))

    renderFeedRoutes()

    expect(screen.getByText('Carregando...')).toBeInTheDocument()
  })

  it('shows an empty-feed message when there are no posts and no search', async () => {
    vi.mocked(getSession).mockResolvedValue({ user: null })
    vi.mocked(listPosts).mockResolvedValue(collection({ data: [], pagination: { page: 1, perPage: 9, total: 0, totalPages: 1 } }))

    renderFeedRoutes()

    expect(await screen.findByText('Ainda não há posts por aqui.')).toBeInTheDocument()
  })

  it('names the search term in the empty-result message', async () => {
    vi.mocked(getSession).mockResolvedValue({ user: null })
    vi.mocked(listPosts).mockResolvedValue(
      collection({ data: [], pagination: { page: 1, perPage: 9, total: 0, totalPages: 1 } }),
    )

    renderFeedRoutes()
    await userEvent.type(await screen.findByLabelText('Buscar posts'), 'kubernetes{Enter}')

    await waitFor(() =>
      expect(
        screen.getByText('Nenhum post encontrado para “kubernetes”.'),
      ).toBeInTheDocument(),
    )
    expect(listPosts).toHaveBeenLastCalledWith(
      { q: 'kubernetes', page: 1 },
      expect.anything(),
    )
  })

  it('reports an error from the API', async () => {
    vi.mocked(getSession).mockResolvedValue({ user: null })
    vi.mocked(listPosts).mockRejectedValue(apiError(500))

    renderFeedRoutes()

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('toggles a like for a signed-in viewer', async () => {
    vi.mocked(getSession).mockResolvedValue({
      user: {
        id: 1,
        name: 'Ana Souza',
        email: 'ana@exemplo.com',
        createdAt: '2026-10-02T12:00:00.000Z',
        links: { self: '/users/1' },
      },
    })
    vi.mocked(listPosts).mockResolvedValue(collection())
    vi.mocked(likePost).mockResolvedValue()

    renderFeedRoutes()
    await screen.findByRole('button', { name: 'Sair' })

    const like = await screen.findByRole('button', {
      name: /Curtir o post Componentes React na prática/,
    })
    await userEvent.click(like)

    await waitFor(() => expect(likePost).toHaveBeenCalledWith('componentes-react-na-pratica'))
  })

  it('signs out and the sidebar switches back to Login', async () => {
    vi.mocked(getSession).mockResolvedValue({
      user: {
        id: 1,
        name: 'Ana Souza',
        email: 'ana@exemplo.com',
        createdAt: '2026-10-02T12:00:00.000Z',
        links: { self: '/users/1' },
      },
    })
    vi.mocked(listPosts).mockResolvedValue(collection())

    renderFeedRoutes()
    const signOut = await screen.findByRole('button', { name: 'Sair' })
    await userEvent.click(signOut)

    expect(await screen.findByRole('link', { name: 'Login' })).toBeInTheDocument()
  })

  it('sets the page title and description', async () => {
    vi.mocked(getSession).mockResolvedValue({ user: null })
    vi.mocked(listPosts).mockResolvedValue(collection())

    renderFeedRoutes()
    await screen.findByRole('heading', { level: 1, name: 'Feed' })

    // usePageMeta sets the title in its own effect, which can still be
    // pending in the tick right after the heading commits.
    await waitFor(() => expect(document.title).toBe('Feed | Code Connect'))
  })

  it('has no WCAG 2.2 AA violations', async () => {
    vi.mocked(getSession).mockResolvedValue({ user: null })
    vi.mocked(listPosts).mockResolvedValue(collection())

    const { container } = renderFeedRoutes()
    await screen.findByRole('heading', { level: 2 })

    await expectNoA11yViolations(container)
  })
})
