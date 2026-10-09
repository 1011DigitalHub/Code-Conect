import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithRouter } from '../../../test/renderWithRouter'
import { expectNoA11yViolations } from '../../../test/axe'
import { LinkAccountForm } from './LinkAccountForm'

describe('LinkAccountForm', () => {
  it('submits the typed password', async () => {
    const onSubmit = vi.fn()
    renderWithRouter(<LinkAccountForm onSubmit={onSubmit} />)

    await userEvent.type(screen.getByLabelText('Senha'), 'senha-segura-123')
    await userEvent.click(screen.getByRole('button', { name: 'Vincular conta' }))

    expect(onSubmit).toHaveBeenCalledWith({ password: 'senha-segura-123' })
  })

  it('does not submit while the password is empty', async () => {
    const onSubmit = vi.fn()
    renderWithRouter(<LinkAccountForm onSubmit={onSubmit} />)

    await userEvent.click(screen.getByRole('button', { name: 'Vincular conta' }))

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('disables the button and shows progress while submitting', () => {
    renderWithRouter(<LinkAccountForm onSubmit={vi.fn()} submitting />)

    expect(screen.getByRole('button', { name: 'Vinculando...' })).toBeDisabled()
  })

  it('shows the error as an alert', () => {
    renderWithRouter(
      <LinkAccountForm onSubmit={vi.fn()} error="Não foi possível concluir a vinculação." />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível concluir a vinculação.')
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = renderWithRouter(
      <LinkAccountForm onSubmit={vi.fn()} error="Não foi possível concluir a vinculação." />,
    )

    await expectNoA11yViolations(container)
  })
})
