import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import { MemoryRouter, Route, Routes } from 'react-router'
import { vi } from 'vitest'
import { login, startOidcLogin } from '../../api/auth'
import { renderWithRouter } from '../../test/renderWithRouter'
import { LoginPage } from './LoginPage'
import { expectNoA11yViolations } from '../../test/axe'

vi.mock('../../api/auth', () => ({ login: vi.fn(), startOidcLogin: vi.fn() }))

function apiError(status: number) {
  const config = { headers: new AxiosHeaders() }
  const response = { data: {}, status, statusText: '', headers: {}, config } as AxiosResponse
  return new AxiosError('failed', AxiosError.ERR_BAD_REQUEST, config, null, response)
}

function renderLoginRoutes(route = '/login') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/perfil" element={<p>Tela de perfil</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function fillAndSubmit({ remember = false } = {}) {
  await userEvent.type(screen.getByLabelText('Email'), 'ana@exemplo.com')
  await userEvent.type(screen.getByLabelText('Senha'), 'segredo-123')
  if (remember) {
    await userEvent.click(screen.getByRole('checkbox', { name: 'Lembrar-me' }))
  }
  await userEvent.click(screen.getByRole('button', { name: 'Login' }))
}

describe('LoginPage', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('renders the login form, social providers and sign-up link', () => {
    renderWithRouter(<LoginPage />)

    expect(document.title).toBe('Login | Code Connect')
    expect(document.querySelector('meta[name="description"]')).toHaveAttribute(
      'content',
      expect.stringContaining('Entre no Code Connect'),
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Login' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Senha')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Google' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Microsoft' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Google' }).querySelector('img')).toHaveAttribute(
      'src',
      '/icons/google.svg',
    )
    expect(screen.getByRole('button', { name: 'Microsoft' }).querySelector('img')).toHaveAttribute(
      'src',
      '/icons/microsoft.svg',
    )
    expect(screen.getByRole('link', { name: 'Crie seu cadastro!' })).toHaveAttribute(
      'href',
      '/cadastro',
    )
  })

  it('starts the OIDC flow (a real page navigation, not an API call) when a social button is clicked', async () => {
    renderWithRouter(<LoginPage />)

    await userEvent.click(screen.getByRole('button', { name: 'Microsoft' }))

    expect(startOidcLogin).toHaveBeenCalledWith('microsoft')
  })

  it('signs in and goes to the profile; the session is the server-set cookie, not local storage', async () => {
    vi.mocked(login).mockResolvedValue({ tokenType: 'Bearer', expiresIn: 3600 })
    renderLoginRoutes()

    await fillAndSubmit()

    expect(await screen.findByText('Tela de perfil')).toBeInTheDocument()
    expect(login).toHaveBeenCalledWith({
      email: 'ana@exemplo.com',
      password: 'segredo-123',
      remember: false,
    })
    // Regression guard: the token must never land in Web Storage again.
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it('sends remember: true to the API when "Lembrar-me" is checked', async () => {
    vi.mocked(login).mockResolvedValue({ tokenType: 'Bearer', expiresIn: 604800 })
    renderLoginRoutes()

    await fillAndSubmit({ remember: true })

    expect(await screen.findByText('Tela de perfil')).toBeInTheDocument()
    expect(login).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'ana@exemplo.com', remember: true }),
    )
  })

  it('shows the error and stays on the page when the credentials are wrong', async () => {
    vi.mocked(login).mockRejectedValue(apiError(401))
    renderLoginRoutes()

    await fillAndSubmit()

    expect(await screen.findByRole('alert')).toHaveTextContent('Email ou senha inválidos.')
    expect(screen.queryByText('Tela de perfil')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Login' })).toBeEnabled()
  })

  it('shows a generic error when the OIDC flow failed server-side (?oidcError=1)', async () => {
    renderLoginRoutes('/login?oidcError=1')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível entrar com o provedor.',
    )
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = renderWithRouter(<LoginPage />)

    await expectNoA11yViolations(container)
  })
})
