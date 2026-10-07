import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import { MemoryRouter, Route, Routes } from 'react-router'
import { getSession } from '../../api/auth'
import { createPost } from '../../api/posts'
import { expectNoA11yViolations } from '../../test/axe'
import { NewPostPage } from './NewPostPage'

vi.mock('../../api/auth', () => ({ getSession: vi.fn(), logout: vi.fn() }))
vi.mock('../../api/posts', () => ({ createPost: vi.fn() }))

function apiError(status: number) {
  const config = { headers: new AxiosHeaders() }
  const response = { data: {}, status, statusText: '', headers: {}, config } as AxiosResponse
  return new AxiosError('failed', AxiosError.ERR_BAD_REQUEST, config, null, response)
}

const user = {
  id: 1,
  name: 'Ana Souza',
  email: 'ana@exemplo.com',
  createdAt: '2026-10-02T12:00:00.000Z',
  links: { self: '/users/1' },
}

function renderNewPostRoutes() {
  return render(
    <MemoryRouter initialEntries={['/posts/novo']}>
      <Routes>
        <Route path="/posts/novo" element={<NewPostPage />} />
        <Route path="/login" element={<p>Tela de login</p>} />
        <Route path="/posts/:slug" element={<p>Post publicado</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('NewPostPage', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('redirects to the login page without a session', async () => {
    vi.mocked(getSession).mockResolvedValue({ user: null })

    renderNewPostRoutes()

    expect(await screen.findByText('Tela de login')).toBeInTheDocument()
  })

  it('renders the form for a signed-in viewer', async () => {
    vi.mocked(getSession).mockResolvedValue({ user })

    renderNewPostRoutes()

    expect(await screen.findByLabelText('Título')).toBeInTheDocument()
  })

  it('submits and navigates to the new post', async () => {
    vi.mocked(getSession).mockResolvedValue({ user })
    vi.mocked(createPost).mockResolvedValue({
      slug: 'um-novo-post',
      title: 'Um novo post',
      excerpt:
        'Um resumo com tamanho suficiente para servir de meta descrição da página.',
      content: 'Corpo do post',
      thumbnailUrl: undefined as unknown as string | null,
      createdAt: '2026-10-05T12:00:00.000Z',
      author: { id: 1, name: 'Ana Souza', self: '/users/1' },
      likeCount: 0,
      commentCount: 0,
      likedByMe: false,
      links: {
        self: '/posts/um-novo-post',
        comments: '/posts/um-novo-post/comments',
        like: '/posts/um-novo-post/like',
        author: '/users/1',
      },
    })

    renderNewPostRoutes()
    await userEvent.type(await screen.findByLabelText('Título'), 'Um novo post')
    await userEvent.type(
      screen.getByLabelText(/^Resumo/),
      'Um resumo com tamanho suficiente para servir de meta descrição da página.',
    )
    await userEvent.type(screen.getByLabelText(/^Conteúdo/), 'Corpo com conteúdo suficiente.')
    await userEvent.click(screen.getByRole('button', { name: 'Publicar' }))

    expect(await screen.findByText('Post publicado')).toBeInTheDocument()
  })

  it('reports a submission failure', async () => {
    vi.mocked(getSession).mockResolvedValue({ user })
    vi.mocked(createPost).mockRejectedValue(apiError(409))

    renderNewPostRoutes()
    await userEvent.type(await screen.findByLabelText('Título'), 'Um novo post')
    await userEvent.type(
      screen.getByLabelText(/^Resumo/),
      'Um resumo com tamanho suficiente para servir de meta descrição da página.',
    )
    await userEvent.type(screen.getByLabelText(/^Conteúdo/), 'Corpo com conteúdo suficiente.')
    await userEvent.click(screen.getByRole('button', { name: 'Publicar' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('has no WCAG 2.2 AA violations', async () => {
    vi.mocked(getSession).mockResolvedValue({ user })

    const { container } = renderNewPostRoutes()
    await screen.findByLabelText('Título')

    await expectNoA11yViolations(container)
  })
})
