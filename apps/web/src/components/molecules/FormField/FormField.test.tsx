import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FormField } from './FormField'
import { expectNoA11yViolations } from '../../../test/axe'

describe('FormField', () => {
  it('associates the label with the input', async () => {
    render(<FormField id="login" label="Email ou usuário" />)
    const input = screen.getByLabelText('Email ou usuário')

    await userEvent.type(input, 'usuario123')

    expect(input).toHaveValue('usuario123')
  })

  it('shows the error message and marks the input as invalid', () => {
    render(<FormField id="login" label="Email ou usuário" error="Campo obrigatório" />)

    expect(screen.getByRole('alert')).toHaveTextContent('Campo obrigatório')
    expect(screen.getByLabelText('Email ou usuário')).toBeInvalid()
    expect(screen.getByLabelText('Email ou usuário')).toHaveAccessibleDescription(
      'Campo obrigatório',
    )
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = render(<FormField id="login" label="Email ou usuário" error="Campo obrigatório" />)

    await expectNoA11yViolations(container)
  })
})
