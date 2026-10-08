import { screen } from '@testing-library/react'
import { FeedTemplate } from './FeedTemplate'
import { renderWithRouter } from '../../../test/renderWithRouter'
import { expectNoA11yViolations } from '../../../test/axe'

describe('FeedTemplate', () => {
  it('renders the heading when a title is given', () => {
    renderWithRouter(
      <FeedTemplate title="Feed" authenticated={false} onSignOut={vi.fn()}>
        <p>Conteúdo</p>
      </FeedTemplate>,
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Feed' })).toBeInTheDocument()
  })

  it('renders no h1 of its own when the title is omitted', () => {
    // The post page supplies its own h1 (the post title) through children.
    renderWithRouter(
      <FeedTemplate authenticated={false} onSignOut={vi.fn()}>
        <h1>Título do post</h1>
      </FeedTemplate>,
    )

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Título do post',
    )
  })

  it('renders its children', () => {
    renderWithRouter(
      <FeedTemplate title="Feed" authenticated={false} onSignOut={vi.fn()}>
        <p>Conteúdo</p>
      </FeedTemplate>,
    )

    expect(screen.getByText('Conteúdo')).toBeInTheDocument()
  })

  it('provides exactly one main landmark and the side menu', () => {
    renderWithRouter(
      <FeedTemplate title="Feed" authenticated={false} onSignOut={vi.fn()}>
        <p>Conteúdo</p>
      </FeedTemplate>,
    )

    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(
      screen.getByRole('navigation', { name: 'Menu principal' }),
    ).toBeInTheDocument()
  })

  it('passes the session through to the side menu', () => {
    renderWithRouter(
      <FeedTemplate title="Feed" authenticated onSignOut={vi.fn()}>
        <p>Conteúdo</p>
      </FeedTemplate>,
    )

    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument()
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = renderWithRouter(
      <FeedTemplate title="Feed" authenticated={false} onSignOut={vi.fn()}>
        <p>Conteúdo</p>
      </FeedTemplate>,
    )

    await expectNoA11yViolations(container)
  })
})
