import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import { MemoryRouter, Route, Routes } from 'react-router'
import { vi } from 'vitest'
import { login, startOidcLogin } from '../../api/auth'
import { createUser } from '../../api/users'
import { renderWithRouter } from '../../test/renderWithRouter'
import { SignUpPage } from './SignUpPage'
import { expectNoA11yViolations } from '../../test/axe'

vi.mock('../../api/auth', () => ({ login: vi.fn(), startOidcLogin: vi.fn() }))
vi.mock('../../api/users', () => ({ createUser: vi.fn() }))

const createdUser = {
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

function renderSignUpRoutes() {
  return render(
    <MemoryRouter initialEntries={['/cadastro']}>
      <Routes>
        <Route path="/cadastro" element={<SignUpPage />} />
        <Route path="/login" element={<p>Tela de login</p>} />
        <Route path="/perfil" element={<p>Tela de perfil</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function fillAndSubmit() {
  await userEvent.type(screen.getByLabelText('Nome'), 'Ana Souza')
  await userEvent.type(screen.getByLabelText('Email'), 'ana@exemplo.com')
  await userEvent.type(screen.getByLabelText('Senha'), 'segredo-123')
  await userEvent.click(screen.getByRole('button', { name: 'Cadastrar' }))
}

describe('SignUpPage', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('renders the sign-up form, social providers and login link', () => {
    renderWithRouter(<SignUpPage />)

    expect(document.title).toBe('Cadastro | Code Connect')
    expect(document.querySelector('meta[name="description"]')).toHaveAttribute(
      'content',
      expect.stringContaining('Crie sua conta no Code Connect'),
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Cadastro' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Pessoa programando/ })).toHaveAttribute(
      'src',
      '/Banner_cadastro_page.webp',
    )
    expect(screen.getByLabelText('Nome')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Senha')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cadastrar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Google' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Microsoft' })).toBeEnabled()
    expect(screen.getByRole('link', { name: 'Faça seu login!' })).toHaveAttribute(
      'href',
      '/login',
    )
  })

  it('starts the OIDC flow (a real page navigation, not an API call) when a social button is clicked', async () => {
    renderWithRouter(<SignUpPage />)

    await userEvent.click(screen.getByRole('button', { name: 'Google' }))

    expect(startOidcLogin).toHaveBeenCalledWith('google')
  })

  it('creates the account, signs in and goes to the profile; no token is stored locally', async () => {
    vi.mocked(createUser).mockResolvedValue(createdUser)
    vi.mocked(login).mockResolvedValue({ tokenType: 'Bearer', expiresIn: 3600 })
    renderSignUpRoutes()

    await fillAndSubmit()

    expect(await screen.findByText('Tela de perfil')).toBeInTheDocument()
    expect(createUser).toHaveBeenCalledWith({
      name: 'Ana Souza',
      email: 'ana@exemplo.com',
      password: 'segredo-123',
    })
    expect(login).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'ana@exemplo.com', password: 'segredo-123' }),
    )
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it('shows the error and does not sign in when the email is already registered', async () => {
    vi.mocked(createUser).mockRejectedValue(apiError(409))
    renderSignUpRoutes()

    await fillAndSubmit()

    expect(await screen.findByRole('alert')).toHaveTextContent('Este email já está cadastrado.')
    expect(login).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Cadastrar' })).toBeEnabled()
  })

  it('goes to the login page when the account is created but the sign-in fails', async () => {
    vi.mocked(createUser).mockResolvedValue(createdUser)
    vi.mocked(login).mockRejectedValue(apiError(500))
    renderSignUpRoutes()

    await fillAndSubmit()

    expect(await screen.findByText('Tela de login')).toBeInTheDocument()
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = renderWithRouter(<SignUpPage />)

    await expectNoA11yViolations(container)
  })
})
