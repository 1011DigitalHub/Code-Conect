import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SignUpForm } from './SignUpForm'

describe('SignUpForm', () => {
  it('submits the typed data and the remember option', async () => {
    const onSubmit = vi.fn()
    render(<SignUpForm onSubmit={onSubmit} />)

    await userEvent.type(screen.getByLabelText('Nome'), 'Ana Souza')
    await userEvent.type(screen.getByLabelText('Email'), 'ana@exemplo.com')
    await userEvent.type(screen.getByLabelText('Senha'), 'segredo')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Lembrar-me' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cadastrar' }))

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Ana Souza',
      email: 'ana@exemplo.com',
      password: 'segredo',
      remember: true,
    })
  })

  it('masks the password', () => {
    render(<SignUpForm onSubmit={vi.fn()} />)

    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'password')
  })

  it('does not submit while required fields are empty', async () => {
    const onSubmit = vi.fn()
    render(<SignUpForm onSubmit={onSubmit} />)

    await userEvent.click(screen.getByRole('button', { name: 'Cadastrar' }))

    expect(onSubmit).not.toHaveBeenCalled()
  })
})
