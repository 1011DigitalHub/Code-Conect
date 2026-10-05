import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import { MemoryRouter, Route, Routes } from 'react-router'
import { vi } from 'vitest'
import { getMe, logout } from '../../api/auth'
import { expectNoA11yViolations } from '../../test/axe'
import { ProfilePage } from './ProfilePage'

vi.mock('../../api/auth', () => ({ getMe: vi.fn(), logout: vi.fn() }))

const user = {
  id: 1,
  name: 'Ana Souza',
  email: 'ana@exemplo.com',
  createdAt: '2026-10-02T12:00:00.000Z',
  links: { self: '/users/1' },
}

function apiError(status: number) {
  const config = { headers: new AxiosHeaders() }
  const response = { data: {}, status, statusText: '', headers: {}, config } as AxiosResponse
  return new AxiosError('failed', AxiosError.ERR_BAD_REQUEST, config, null, response)
}

function renderProfileRoutes() {
  return render(
    <MemoryRouter initialEntries={['/perfil']}>
      <Routes>
        <Route path="/perfil" element={<ProfilePage />} />
        <Route path="/login" element={<p>Tela de login</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProfilePage', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('probes the session and goes to the login page when /auth/me answers 401', async () => {
    vi.mocked(getMe).mockRejectedValue(apiError(401))
    renderProfileRoutes()

    // There is no readable token anymore, so the page always probes the
    // server — it can no longer skip the call the way a synchronous
    // "is there a token" check used to.
    expect(getMe).toHaveBeenCalled()
    expect(await screen.findByText('Tela de login')).toBeInTheDocument()
  })

  it('shows a loading status, then the logged-in user', async () => {
    vi.mocked(getMe).mockResolvedValue(user)
    renderProfileRoutes()

    expect(document.title).toBe('Perfil | Code Connect')
    expect(screen.getByRole('status')).toHaveTextContent('Carregando...')
    expect(screen.getByRole('heading', { level: 1, name: 'Perfil' })).toBeInTheDocument()

    expect(await screen.findByText('Ana Souza')).toBeInTheDocument()
    expect(screen.getByText('ana@exemplo.com')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows an error and stays on the page when the server fails for another reason', async () => {
    vi.mocked(getMe).mockRejectedValue(apiError(500))
    renderProfileRoutes()

    expect(await screen.findByRole('alert')).toHaveTextContent('Algo deu errado. Tente novamente.')
    expect(screen.queryByText('Tela de login')).not.toBeInTheDocument()
  })

  it('signs out: calls the logout endpoint and goes to the login page', async () => {
    vi.mocked(getMe).mockResolvedValue(user)
    vi.mocked(logout).mockResolvedValue(undefined)
    renderProfileRoutes()

    await userEvent.click(await screen.findByRole('button', { name: 'Sair' }))

    expect(logout).toHaveBeenCalled()
    expect(await screen.findByText('Tela de login')).toBeInTheDocument()
  })

  it('still goes to the login page when the logout request itself fails', async () => {
    vi.mocked(getMe).mockResolvedValue(user)
    vi.mocked(logout).mockRejectedValue(apiError(500))
    renderProfileRoutes()

    await userEvent.click(await screen.findByRole('button', { name: 'Sair' }))

    expect(await screen.findByText('Tela de login')).toBeInTheDocument()
  })

  it('has no WCAG 2.2 AA violations', async () => {
    vi.mocked(getMe).mockResolvedValue(user)
    const { container } = renderProfileRoutes()
    await screen.findByText('Ana Souza')

    await expectNoA11yViolations(container)
  })
})
