import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SignUpForm } from './SignUpForm'
import { expectNoA11yViolations } from '../../../test/axe'

describe('SignUpForm', () => {
  it('submits the typed data and the remember option', async () => {
    const onSubmit = vi.fn()
    render(<SignUpForm onSubmit={onSubmit} />)

    await userEvent.type(screen.getByLabelText('Nome'), 'Ana Souza')
    await userEvent.type(screen.getByLabelText('Email'), 'ana@exemplo.com')
    await userEvent.type(screen.getByLabelText('Senha'), 'segredo-123')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Lembrar-me' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cadastrar' }))

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Ana Souza',
      email: 'ana@exemplo.com',
      password: 'segredo-123',
      remember: true,
    })
  })

  it('masks the password', () => {
    render(<SignUpForm onSubmit={vi.fn()} />)

    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'password')
  })

  it('explains the password rule', () => {
    render(<SignUpForm onSubmit={vi.fn()} />)

    expect(screen.getByLabelText('Senha')).toHaveAccessibleDescription('Mínimo de 8 caracteres')
  })

  it('disables the button and shows progress while submitting', () => {
    render(<SignUpForm onSubmit={vi.fn()} submitting />)

    expect(screen.getByRole('button', { name: 'Cadastrando...' })).toBeDisabled()
  })

  it('shows the error as an alert', () => {
    render(<SignUpForm onSubmit={vi.fn()} error="Este email já está cadastrado." />)

    expect(screen.getByRole('alert')).toHaveTextContent('Este email já está cadastrado.')
  })

  it('does not submit while required fields are empty', async () => {
    const onSubmit = vi.fn()
    render(<SignUpForm onSubmit={onSubmit} />)

    await userEvent.click(screen.getByRole('button', { name: 'Cadastrar' }))

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = render(<SignUpForm onSubmit={vi.fn()} error="Este email já está cadastrado." />)

    await expectNoA11yViolations(container)
  })
})
