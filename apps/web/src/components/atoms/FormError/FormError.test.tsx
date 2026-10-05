import { render, screen } from '@testing-library/react'
import { FormError } from './FormError'
import { expectNoA11yViolations } from '../../../test/axe'

describe('FormError', () => {
  it('announces the message as an alert', () => {
    render(<FormError message="Email ou senha inválidos." />)

    expect(screen.getByRole('alert')).toHaveTextContent('Erro: Email ou senha inválidos.')
  })

  it('renders nothing without a message', () => {
    const { container } = render(<FormError />)

    expect(container).toBeEmptyDOMElement()
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = render(<FormError message="Email ou senha inválidos." />)

    await expectNoA11yViolations(container)
  })
})
