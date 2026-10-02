import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import { MemoryRouter, Route, Routes } from 'react-router'
import { vi } from 'vitest'
import { getMe } from '../../api/auth'
import { clearToken, getToken, saveToken } from '../../api/tokenStorage'
import { expectNoA11yViolations } from '../../test/axe'
import { ProfilePage } from './ProfilePage'

vi.mock('../../api/auth', () => ({ getMe: vi.fn() }))

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
    clearToken()
  })

  it('goes to the login page when there is no token', () => {
    renderProfileRoutes()

    expect(screen.getByText('Tela de login')).toBeInTheDocument()
    expect(getMe).not.toHaveBeenCalled()
  })

  it('shows a loading status, then the logged-in user', async () => {
    saveToken('jwt', false)
    vi.mocked(getMe).mockResolvedValue(user)
    renderProfileRoutes()

    expect(document.title).toBe('Perfil | Code Connect')
    expect(screen.getByRole('status')).toHaveTextContent('Carregando...')
    expect(screen.getByRole('heading', { level: 1, name: 'Perfil' })).toBeInTheDocument()

    expect(await screen.findByText('Ana Souza')).toBeInTheDocument()
    expect(screen.getByText('ana@exemplo.com')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('drops the token and goes to the login page when it has expired', async () => {
    saveToken('expired', false)
    vi.mocked(getMe).mockRejectedValue(apiError(401))
    renderProfileRoutes()

    expect(await screen.findByText('Tela de login')).toBeInTheDocument()
    expect(getToken()).toBeNull()
  })

  it('shows an error and keeps the token when the server fails', async () => {
    saveToken('jwt', false)
    vi.mocked(getMe).mockRejectedValue(apiError(500))
    renderProfileRoutes()

    expect(await screen.findByRole('alert')).toHaveTextContent('Algo deu errado. Tente novamente.')
    expect(getToken()).toBe('jwt')
  })

  it('signs out: clears the token and goes to the login page', async () => {
    saveToken('jwt', true)
    vi.mocked(getMe).mockResolvedValue(user)
    renderProfileRoutes()

    await userEvent.click(await screen.findByRole('button', { name: 'Sair' }))

    expect(screen.getByText('Tela de login')).toBeInTheDocument()
    expect(getToken()).toBeNull()
  })

  it('has no WCAG 2.2 AA violations', async () => {
    saveToken('jwt', false)
    vi.mocked(getMe).mockResolvedValue(user)
    const { container } = renderProfileRoutes()
    await screen.findByText('Ana Souza')

    await expectNoA11yViolations(container)
  })
})
