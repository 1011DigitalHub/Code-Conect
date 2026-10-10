import { render, screen } from '@testing-library/react'
import { expectNoA11yViolations } from '../../../test/axe'
import { CardErrorBoundary } from './CardErrorBoundary'

function Explodes(): never {
  throw new Error('render falhou')
}

describe('CardErrorBoundary', () => {
  // React logs the caught error itself, even when the boundary handles it.
  // Restored after every test: a spy left in place would swallow legitimate
  // errors from the rest of the suite and hide real regressions.
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.mocked(console.error).mockRestore()
  })

  it('renders its children while nothing throws', () => {
    render(
      <CardErrorBoundary>
        <p>Conteúdo normal</p>
      </CardErrorBoundary>,
    )

    expect(screen.getByText('Conteúdo normal')).toBeInTheDocument()
  })

  it('renders nothing when a child throws during render, instead of taking down the caller', () => {
    const { container } = render(
      <CardErrorBoundary>
        <Explodes />
      </CardErrorBoundary>,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('logs the error it caught for diagnosability', () => {
    render(
      <CardErrorBoundary>
        <Explodes />
      </CardErrorBoundary>,
    )

    expect(console.error).toHaveBeenCalledWith(
      'render error caught by a card boundary',
      expect.any(Error),
      expect.any(String),
    )
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = render(
      <CardErrorBoundary>
        <p>Conteúdo normal</p>
      </CardErrorBoundary>,
    )

    await expectNoA11yViolations(container)
  })
})
