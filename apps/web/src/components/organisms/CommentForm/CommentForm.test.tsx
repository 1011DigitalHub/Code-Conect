import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommentForm } from './CommentForm'
import { renderWithRouter } from '../../../test/renderWithRouter'
import { expectNoA11yViolations } from '../../../test/axe'

describe('CommentForm, signed out', () => {
  it('offers a login link and no form at all', () => {
    const { container } = renderWithRouter(
      <CommentForm authenticated={false} onSubmit={vi.fn()} />,
    )

    expect(screen.getByRole('link', { name: 'Entre para comentar' })).toHaveAttribute(
      'href',
      '/login',
    )
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    // Not a disabled field: a disabled control cannot be focused, which
    // would break the browser suite's Tab traversal.
    expect(container.querySelector('[disabled]')).toBeNull()
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = renderWithRouter(
      <CommentForm authenticated={false} onSubmit={vi.fn()} />,
    )

    await expectNoA11yViolations(container)
  })
})

describe('CommentForm, signed in', () => {
  it('submits the trimmed comment and clears the field', async () => {
    const onSubmit = vi.fn()
    renderWithRouter(<CommentForm authenticated onSubmit={onSubmit} />)

    const field = screen.getByLabelText('Seu comentário')
    await userEvent.type(field, '  Muito bom!  ')
    await userEvent.click(screen.getByRole('button', { name: 'Comentar' }))

    expect(onSubmit).toHaveBeenCalledWith('Muito bom!')
    expect(field).toHaveValue('')
  })

  it('refuses an empty comment and says why', async () => {
    const onSubmit = vi.fn()
    renderWithRouter(<CommentForm authenticated onSubmit={onSubmit} />)

    await userEvent.click(screen.getByRole('button', { name: 'Comentar' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Escreva um comentário antes de enviar.',
    )
  })

  it('refuses a comment that is only whitespace', async () => {
    const onSubmit = vi.fn()
    renderWithRouter(<CommentForm authenticated onSubmit={onSubmit} />)

    await userEvent.type(screen.getByLabelText('Seu comentário'), '   ')
    await userEvent.click(screen.getByRole('button', { name: 'Comentar' }))

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('caps the length at what the API accepts', () => {
    renderWithRouter(<CommentForm authenticated onSubmit={vi.fn()} />)

    expect(screen.getByLabelText('Seu comentário')).toHaveAttribute('maxlength', '1000')
  })

  it('shows a request failure', () => {
    renderWithRouter(
      <CommentForm authenticated error="Algo deu errado. Tente novamente." onSubmit={vi.fn()} />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Algo deu errado. Tente novamente.',
    )
  })

  it('reports progress while the request is in flight', () => {
    renderWithRouter(<CommentForm authenticated pending onSubmit={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Enviando...' })).toBeDisabled()
  })

  it('is enabled on an idle render', () => {
    renderWithRouter(<CommentForm authenticated onSubmit={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Comentar' })).toBeEnabled()
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = renderWithRouter(
      <CommentForm authenticated onSubmit={vi.fn()} />,
    )

    await expectNoA11yViolations(container)
  })
})
