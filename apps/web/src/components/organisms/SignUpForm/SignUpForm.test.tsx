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

  it('shows per-field errors when submitted with empty fields', async () => {
    render(<SignUpForm onSubmit={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Cadastrar' }))

    expect(screen.getByLabelText('Nome')).toHaveAccessibleDescription('Nome é obrigatório')
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Email é obrigatório')
    expect(screen.getByLabelText('Senha')).toHaveAccessibleDescription(
      /Senha é obrigatória/,
    )
  })

  it('shows an email field error for an invalid email format', async () => {
    const onSubmit = vi.fn()
    render(<SignUpForm onSubmit={onSubmit} />)

    await userEvent.type(screen.getByLabelText('Nome'), 'Ana Souza')
    await userEvent.type(screen.getByLabelText('Email'), 'nao-e-um-email')
    await userEvent.type(screen.getByLabelText('Senha'), 'segredo-123')
    await userEvent.click(screen.getByRole('button', { name: 'Cadastrar' }))

    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Email inválido')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows a password field error for a password shorter than 8 characters', async () => {
    const onSubmit = vi.fn()
    render(<SignUpForm onSubmit={onSubmit} />)

    await userEvent.type(screen.getByLabelText('Nome'), 'Ana Souza')
    await userEvent.type(screen.getByLabelText('Email'), 'ana@exemplo.com')
    await userEvent.type(screen.getByLabelText('Senha'), 'curta')
    await userEvent.click(screen.getByRole('button', { name: 'Cadastrar' }))

    expect(screen.getByLabelText('Senha')).toHaveAccessibleDescription(
      /Senha deve ter no mínimo 8 caracteres/,
    )
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('clears the field error once the user starts correcting it', async () => {
    render(<SignUpForm onSubmit={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Cadastrar' }))
    expect(screen.getByLabelText('Nome')).toHaveAccessibleDescription('Nome é obrigatório')

    await userEvent.type(screen.getByLabelText('Nome'), 'a')
    expect(screen.getByLabelText('Nome')).not.toHaveAccessibleDescription('Nome é obrigatório')
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = render(<SignUpForm onSubmit={vi.fn()} error="Este email já está cadastrado." />)

    await expectNoA11yViolations(container)
  })

  it('has no WCAG 2.2 AA violations when field errors are shown', async () => {
    const { container } = render(<SignUpForm onSubmit={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Cadastrar' }))
    await expectNoA11yViolations(container)
  })
})
