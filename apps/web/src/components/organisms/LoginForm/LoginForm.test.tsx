import { screen } from '@testing-library/react'
import { renderWithRouter } from '../../../test/renderWithRouter'
import userEvent from '@testing-library/user-event'
import { LoginForm } from './LoginForm'
import { expectNoA11yViolations } from '../../../test/axe'

describe('LoginForm', () => {
  it('submits the typed credentials and the remember option', async () => {
    const onSubmit = vi.fn()
    renderWithRouter(<LoginForm onSubmit={onSubmit} forgotPasswordHref="/recuperar-senha" />)

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
    renderWithRouter(<LoginForm onSubmit={onSubmit} forgotPasswordHref="/recuperar-senha" />)

    await userEvent.click(screen.getByRole('button', { name: 'Login' }))

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('links to password recovery', () => {
    renderWithRouter(<LoginForm onSubmit={vi.fn()} forgotPasswordHref="/recuperar-senha" />)

    expect(screen.getByRole('link', { name: 'Esqueci a senha' })).toHaveAttribute(
      'href',
      '/recuperar-senha',
    )
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = renderWithRouter(<LoginForm onSubmit={vi.fn()} forgotPasswordHref="/recuperar-senha" />)

    await expectNoA11yViolations(container)
  })
})
