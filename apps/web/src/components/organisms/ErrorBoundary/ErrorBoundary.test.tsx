import { render, screen } from '@testing-library/react'
import { expectNoA11yViolations } from '../../../test/axe'
import { ErrorBoundary } from './ErrorBoundary'

function Explodes(): never {
  throw new Error('render falhou')
}

describe('ErrorBoundary', () => {
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
      <ErrorBoundary>
        <p>Conteúdo normal</p>
      </ErrorBoundary>,
    )

    expect(screen.getByText('Conteúdo normal')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Algo deu errado' })).not.toBeInTheDocument()
  })

  it('shows the fallback when a child throws during render', () => {
    render(
      <ErrorBoundary>
        <Explodes />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Algo deu errado' })).toBeInTheDocument()
  })

  it('offers a way back to the feed from the fallback', () => {
    render(
      <ErrorBoundary>
        <Explodes />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('link', { name: 'Voltar para o feed' })).toHaveAttribute('href', '/')
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = render(
      <ErrorBoundary>
        <Explodes />
      </ErrorBoundary>,
    )

    await expectNoA11yViolations(container)
  })
})
