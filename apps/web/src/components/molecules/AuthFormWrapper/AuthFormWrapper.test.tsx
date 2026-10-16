import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthFormWrapper } from './AuthFormWrapper'
import { expectNoA11yViolations } from '../../../test/axe'

describe('AuthFormWrapper', () => {
  it('renders children inside the form', () => {
    render(
      <AuthFormWrapper onSubmit={vi.fn()} submitLabel="Enviar" submittingLabel="Enviando...">
        <input aria-label="Campo de teste" />
      </AuthFormWrapper>,
    )

    expect(screen.getByLabelText('Campo de teste')).toBeInTheDocument()
  })

  it('shows the submit label on the button', () => {
    render(
      <AuthFormWrapper onSubmit={vi.fn()} submitLabel="Entrar" submittingLabel="Entrando...">
        <input aria-label="Campo" />
      </AuthFormWrapper>,
    )

    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument()
  })

  it('shows the submitting label and disables the button while submitting', () => {
    render(
      <AuthFormWrapper
        onSubmit={vi.fn()}
        submitLabel="Entrar"
        submittingLabel="Entrando..."
        submitting
      >
        <input aria-label="Campo" />
      </AuthFormWrapper>,
    )

    expect(screen.getByRole('button', { name: 'Entrando...' })).toBeDisabled()
  })

  it('shows the error message as an alert', () => {
    render(
      <AuthFormWrapper
        onSubmit={vi.fn()}
        submitLabel="Entrar"
        submittingLabel="Entrando..."
        error="Algo deu errado."
      >
        <input aria-label="Campo" />
      </AuthFormWrapper>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Algo deu errado.')
  })

  it('calls onSubmit when the button is clicked', async () => {
    const onSubmit = vi.fn((event) => event.preventDefault())
    render(
      <AuthFormWrapper onSubmit={onSubmit} submitLabel="Entrar" submittingLabel="Entrando...">
        <input aria-label="Campo" />
      </AuthFormWrapper>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = render(
      <AuthFormWrapper
        onSubmit={vi.fn()}
        submitLabel="Entrar"
        submittingLabel="Entrando..."
        error="Erro de autenticação."
      >
        <label htmlFor="test-field">Email</label>
        <input id="test-field" type="email" />
      </AuthFormWrapper>,
    )

    await expectNoA11yViolations(container)
  })
})
