import { Component, type ErrorInfo, type ReactNode } from 'react'

export type ErrorBoundaryProps = {
  children: ReactNode
}

type ErrorBoundaryState = {
  failed: boolean
}

// Last line of defence for a render that throws: without it React unmounts the
// whole tree and leaves a blank screen. The likeliest trigger here is TextLink,
// which throws on an href that is not site-relative (see atoms/TextLink).
//
// A class component because getDerivedStateFromError/componentDidCatch have no
// hook equivalent in React 19, and a dependency is not worth ~40 lines.
//
// The fallback below is deliberately built from native h1/p/a with Tailwind
// classes instead of the Heading and TextLink atoms: a safety net must not
// depend on what it protects. If the design system itself is what broke — and
// TextLink's throw is the most likely cause — a fallback made of those same
// atoms would fail in turn, and React discards a boundary that throws while
// rendering its own fallback. Native elements cannot fail that way.
//
// The plain <a> is also wanted for its own sake: it triggers a real page
// navigation, which remounts the app and discards the corrupted React state
// that caused the error. A react-router <Link> would keep the same tree alive.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // No error reporting service in this project, so the console is the only
    // place this can go. Keeping the component stack makes it diagnosable.
    console.error('render error caught by the boundary', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <main className="flex min-h-screen items-center justify-center px-3 py-10 md:p-8">
        <div className="flex w-full max-w-md flex-col gap-8 rounded-4xl border border-page bg-surface px-4 py-8 md:px-12 md:py-12">
          <h1 className="text-subtitle font-semibold text-offwhite">Algo deu errado</h1>
          <p className="text-paragraph-sm text-muted">
            Não foi possível exibir esta página. Recarregue para voltar ao feed do Code Connect.
          </p>
          <a
            className="inline-flex items-center gap-3 rounded text-lg text-primary hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            href="/"
          >
            Voltar para o feed
          </a>
        </div>
      </main>
    )
  }
}
