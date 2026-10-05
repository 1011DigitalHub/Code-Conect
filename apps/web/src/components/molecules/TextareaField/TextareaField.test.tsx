import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TextareaField } from './TextareaField'
import { expectNoA11yViolations } from '../../../test/axe'

describe('TextareaField', () => {
  it('wires the label to the textarea', async () => {
    render(<TextareaField id="body" label="Comentário" />)

    await userEvent.type(screen.getByLabelText('Comentário'), 'Muito bom!')

    expect(screen.getByLabelText('Comentário')).toHaveValue('Muito bom!')
  })

  it('announces the error and links it to the field', () => {
    render(<TextareaField id="body" label="Comentário" error="Escreva algo." />)

    const field = screen.getByLabelText('Comentário')
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveAttribute('aria-describedby', 'body-error')
    expect(screen.getByRole('alert')).toHaveTextContent('Escreva algo.')
  })

  it('links the hint to the field', () => {
    render(<TextareaField id="body" label="Comentário" hint="Até 1000 caracteres." />)

    expect(screen.getByLabelText('Comentário')).toHaveAttribute(
      'aria-describedby',
      'body-hint',
    )
  })

  it('links both the hint and the error', () => {
    render(
      <TextareaField
        id="body"
        label="Comentário"
        hint="Até 1000 caracteres."
        error="Escreva algo."
      />,
    )

    expect(screen.getByLabelText('Comentário')).toHaveAttribute(
      'aria-describedby',
      'body-hint body-error',
    )
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = render(
      <TextareaField id="body" label="Comentário" error="Escreva algo." />,
    )

    await expectNoA11yViolations(container)
  })
})
