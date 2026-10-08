import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import { MemoryRouter, Route, Routes } from 'react-router'
import { vi } from 'vitest'
import { linkOidcAccount } from '../../api/auth'
import { renderWithRouter } from '../../test/renderWithRouter'
import { expectNoA11yViolations } from '../../test/axe'
import { VincularContaPage } from './VincularContaPage'

vi.mock('../../api/auth', () => ({ linkOidcAccount: vi.fn() }))

function apiError(status: number) {
  const config = { headers: new AxiosHeaders() }
  const response = { data: {}, status, statusText: '', headers: {}, config } as AxiosResponse
  return new AxiosError('failed', AxiosError.ERR_BAD_REQUEST, config, null, response)
}

function renderVincularContaRoutes(route = '/vincular-conta?provider=google') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/vincular-conta" element={<VincularContaPage />} />
        <Route path="/perfil" element={<p>Tela de perfil</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function fillAndSubmit(password = 'senha-segura-123') {
  await userEvent.type(screen.getByLabelText('Senha'), password)
  await userEvent.click(screen.getByRole('button', { name: 'Vincular conta' }))
}

describe('VincularContaPage', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('renders the password form and names the provider from the query string', () => {
    renderWithRouter(<VincularContaPage />, { route: '/vincular-conta?provider=microsoft' })

    expect(document.title).toBe('Vincular conta | Code Connect')
    expect(screen.getByRole('heading', { level: 1, name: 'Vincular conta' })).toBeInTheDocument()
    expect(screen.getByText(/Microsoft/)).toBeInTheDocument()
    expect(screen.getByLabelText('Senha')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Vincular conta' })).toBeInTheDocument()
  })

  it('falls back to generic copy for a missing or unrecognized provider', () => {
    renderWithRouter(<VincularContaPage />, { route: '/vincular-conta' })

    expect(screen.queryByText(/Google/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Microsoft/)).not.toBeInTheDocument()
  })

  it('links the account and goes to the profile on success', async () => {
    vi.mocked(linkOidcAccount).mockResolvedValue({ tokenType: 'Bearer', expiresIn: 3600 })
    renderVincularContaRoutes()

    await fillAndSubmit()

    expect(await screen.findByText('Tela de perfil')).toBeInTheDocument()
    expect(linkOidcAccount).toHaveBeenCalledWith('senha-segura-123')
  })

  it('shows one generic error for a wrong password, without naming it as such', async () => {
    vi.mocked(linkOidcAccount).mockRejectedValue(apiError(401))
    renderVincularContaRoutes()

    await fillAndSubmit('senha-errada')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Não foi possível concluir a vinculação.')
    expect(alert.textContent).not.toMatch(/senha incorreta|token expirado/i)
    expect(screen.queryByText('Tela de perfil')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Vincular conta' })).toBeEnabled()
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = renderWithRouter(<VincularContaPage />)

    await expectNoA11yViolations(container)
  })
})
