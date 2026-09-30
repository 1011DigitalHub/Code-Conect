import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginForm } from './LoginForm'

describe('LoginForm', () => {
  it('submits the typed credentials and the remember option', async () => {
    const onSubmit = vi.fn()
    render(<LoginForm onSubmit={onSubmit} forgotPasswordHref="/recuperar-senha" />)

    await userEvent.type(screen.getByLabelText('Email ou usuário'), 'usuario123')
    await userEvent.type(screen.getByLabelText('Senha'), 'segredo')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Lembrar-me' }))
    await userEvent.click(screen.getByRole('button', { name: 'Login' }))

    expect(onSubmit).toHaveBeenCalledWith({
      login: 'usuario123',
      password: 'segredo',
      remember: true,
    })
  })

  it('does not submit while required fields are empty', async () => {
    const onSubmit = vi.fn()
    render(<LoginForm onSubmit={onSubmit} forgotPasswordHref="/recuperar-senha" />)

    await userEvent.click(screen.getByRole('button', { name: 'Login' }))

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('links to password recovery', () => {
    render(<LoginForm onSubmit={vi.fn()} forgotPasswordHref="/recuperar-senha" />)

    expect(screen.getByRole('link', { name: 'Esqueci a senha' })).toHaveAttribute(
      'href',
      '/recuperar-senha',
    )
  })
})
