import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Textarea } from './Textarea'
import { expectNoA11yViolations } from '../../../test/axe'

describe('Textarea', () => {
  it('accepts typing', async () => {
    render(<Textarea aria-label="Comentário" />)

    await userEvent.type(screen.getByLabelText('Comentário'), 'Muito bom!')

    expect(screen.getByLabelText('Comentário')).toHaveValue('Muito bom!')
  })

  it('marks itself invalid for assistive technology', () => {
    render(<Textarea aria-label="Comentário" invalid />)

    expect(screen.getByLabelText('Comentário')).toHaveAttribute('aria-invalid', 'true')
  })

  it('leaves aria-invalid off when it is valid', () => {
    render(<Textarea aria-label="Comentário" />)

    expect(screen.getByLabelText('Comentário')).not.toHaveAttribute('aria-invalid')
  })

  it('forwards native props', () => {
    render(<Textarea aria-label="Comentário" maxLength={1000} rows={6} />)

    const field = screen.getByLabelText('Comentário')
    expect(field).toHaveAttribute('maxlength', '1000')
    expect(field).toHaveAttribute('rows', '6')
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = render(<Textarea aria-label="Comentário" />)

    await expectNoA11yViolations(container)
  })
})
