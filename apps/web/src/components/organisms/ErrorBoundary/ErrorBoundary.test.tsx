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

  it('names the page in the title so it stops describing the content that failed', () => {
    render(
      <ErrorBoundary>
        <Explodes />
      </ErrorBoundary>,
    )

    expect(document.title).toBe('Algo deu errado | Code Connect')
  })

  // Browser Back changes the route client-side without remounting anything, so
  // without this the fallback stayed on screen under an unrelated URL.
  it('clears the error when the reset key changes', () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="/posts/um-post">
        <Explodes />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('heading', { name: 'Algo deu errado' })).toBeInTheDocument()

    rerender(
      <ErrorBoundary resetKey="/">
        <p>Feed</p>
      </ErrorBoundary>,
    )

    expect(screen.getByText('Feed')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Algo deu errado' })).not.toBeInTheDocument()
  })

  it('keeps the fallback while the reset key stays the same', () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="/posts/um-post">
        <Explodes />
      </ErrorBoundary>,
    )

    rerender(
      <ErrorBoundary resetKey="/posts/um-post">
        <p>Conteúdo</p>
      </ErrorBoundary>,
    )

    expect(screen.getByRole('heading', { name: 'Algo deu errado' })).toBeInTheDocument()
    expect(screen.queryByText('Conteúdo')).not.toBeInTheDocument()
  })

  // The navigation that changes the key can itself be what lands on a broken
  // page. Resetting on that update would re-render the broken tree and throw
  // again, so the fallback has to survive it.
  //
  // Counting this boundary's own log — rather than every console.error call —
  // is what makes the assertion mean "componentDidCatch ran once": React
  // reports caught errors on its own too, so a total count would measure
  // React's internals as much as ours. Without the guard, this is 2.
  it('keeps the fallback when the error is thrown during the update that changes the key', () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="/a">
        <p>Página sadia</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('Página sadia')).toBeInTheDocument()

    rerender(
      <ErrorBoundary resetKey="/b">
        <Explodes />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Algo deu errado' })).toBeInTheDocument()

    const caught = vi
      .mocked(console.error)
      .mock.calls.filter(([message]) => message === 'render error caught by the boundary')
    expect(caught).toHaveLength(1)
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
