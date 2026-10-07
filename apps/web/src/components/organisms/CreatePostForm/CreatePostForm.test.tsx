import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CreatePostForm } from './CreatePostForm'
import { expectNoA11yViolations } from '../../../test/axe'

const validExcerpt =
  'Como quebrar uma tela grande em componentes pequenos e reaproveitáveis sem perder a legibilidade.'
const validContent = 'Um corpo de post com tamanho suficiente para passar.'

// The excerpt and content fixtures have to be long enough to pass validation,
// and userEvent waits on a timer between keystrokes — ~170 characters of that
// crossed the 5s default timeout under full-suite load. No test here asserts
// on the typing sequence itself, so the delay buys nothing.
const type = (element: Element, text: string) => userEvent.type(element, text, { delay: null })

async function fillValid() {
  await type(screen.getByLabelText('Título'), 'Componentes React')
  await type(screen.getByLabelText(/^Resumo/), validExcerpt)
  await type(screen.getByLabelText(/^Conteúdo/), validContent)
}

describe('CreatePostForm', () => {
  it('submits the trimmed values', async () => {
    const onSubmit = vi.fn()
    render(<CreatePostForm onSubmit={onSubmit} />)

    await fillValid()
    await userEvent.click(screen.getByRole('button', { name: 'Publicar' }))

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Componentes React',
      excerpt: validExcerpt,
      content: validContent,
      thumbnailUrl: undefined,
    })
  })

  it('includes the thumbnail when one is given', async () => {
    const onSubmit = vi.fn()
    render(<CreatePostForm onSubmit={onSubmit} />)

    await fillValid()
    await type(
      screen.getByLabelText(/^Imagem de capa/),
      '/posts/capa.webp',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Publicar' }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ thumbnailUrl: '/posts/capa.webp' }),
    )
  })

  it('refuses an excerpt too short to work as a meta description', async () => {
    const onSubmit = vi.fn()
    render(<CreatePostForm onSubmit={onSubmit} />)

    await type(screen.getByLabelText('Título'), 'Um título')
    await type(screen.getByLabelText(/^Resumo/), 'Curto.')
    await type(screen.getByLabelText(/^Conteúdo/), validContent)
    await userEvent.click(screen.getByRole('button', { name: 'Publicar' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(
      screen.getByText('O resumo precisa de pelo menos 50 caracteres.'),
    ).toBeInTheDocument()
  })

  it('refuses a title that is too short', async () => {
    const onSubmit = vi.fn()
    render(<CreatePostForm onSubmit={onSubmit} />)

    await type(screen.getByLabelText('Título'), 'Oi')
    await type(screen.getByLabelText(/^Resumo/), validExcerpt)
    await type(screen.getByLabelText(/^Conteúdo/), validContent)
    await userEvent.click(screen.getByRole('button', { name: 'Publicar' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(
      screen.getByText('O título precisa de pelo menos 3 caracteres.'),
    ).toBeInTheDocument()
  })

  it('refuses a thumbnail that is not an http url or a rooted path', async () => {
    const onSubmit = vi.fn()
    render(<CreatePostForm onSubmit={onSubmit} />)

    await fillValid()
    await type(screen.getByLabelText(/^Imagem de capa/), 'capa.webp')
    await userEvent.click(screen.getByRole('button', { name: 'Publicar' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(
      screen.getByText('Use um endereço http(s) ou um caminho começando com /.'),
    ).toBeInTheDocument()
  })

  it('reports every invalid field at once', async () => {
    render(<CreatePostForm onSubmit={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Publicar' }))

    expect(screen.getAllByRole('alert')).toHaveLength(3)
  })

  it('shows a request failure', () => {
    render(<CreatePostForm error="Algo deu errado. Tente novamente." onSubmit={vi.fn()} />)

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Algo deu errado. Tente novamente.',
    )
  })

  it('reports progress while publishing', () => {
    render(<CreatePostForm pending onSubmit={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Publicando...' })).toBeDisabled()
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = render(<CreatePostForm onSubmit={vi.fn()} />)

    await expectNoA11yViolations(container)
  })
})
