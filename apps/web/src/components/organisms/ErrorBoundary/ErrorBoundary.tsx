import { Component, type ErrorInfo, type ReactNode } from 'react'

export type ErrorBoundaryProps = {
  children: ReactNode
  // Changing this clears a caught error. App passes react-router's
  // location.key, so navigating away from a page that threw brings the app
  // back instead of leaving the fallback on screen under an unrelated URL —
  // which is what browser Back does, since it changes the route client-side
  // without remounting anything.
  //
  // A prop rather than `<ErrorBoundary key={...}>`: the key idiom is shorter,
  // but it remounts the whole <Routes> subtree on every navigation, which
  // would refetch the feed each time someone returns to it.
  resetKey?: string
}

type ErrorBoundaryState = {
  failed: boolean
}

// Last line of defence for a render that throws: without it React unmounts the
// whole tree and leaves a blank screen. The likeliest trigger here is TextLink,
// which throws on an href that is not site-relative (see atoms/TextLink).
//
// A class component because getDerivedStateFromError/componentDidCatch have no
// hook equivalent in React 19, and a dependency is not worth this much code.
//
// The fallback below is deliberately built from native h1/p/a with Tailwind
// classes instead of the Heading and TextLink atoms: a safety net must not
// depend on what it protects. If the design system itself is what broke — and
// TextLink's throw is the most likely cause — a fallback made of those same
// atoms would fail in turn, and React discards a boundary that throws while
// rendering its own fallback. Native elements cannot fail that way. The site
// name is inlined for the same reason, and because importing it from
// src/pages/ would invert the Atomic Design layering.
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
    // The failed page already set both of these, which would otherwise still
    // describe content that is not on screen (WCAG 2.4.2 Page Titled).
    document.title = 'Algo deu errado | Code Connect'
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', 'Esta página do Code Connect não pôde ser exibida.')

    // No error reporting service in this project, so the console is the only
    // place this can go. Keeping the component stack makes it diagnosable.
    console.error('render error caught by the boundary', error, info.componentStack)
  }

  componentDidUpdate(previous: ErrorBoundaryProps, previousState: ErrorBoundaryState) {
    // previousState.failed, not this.state.failed: the error has to have been
    // on screen *before* this update. Reading current state instead meant that
    // when the navigation changing resetKey was itself what led to a throwing
    // page, the boundary caught the error and cleared it in the same commit —
    // re-rendering the broken tree, throwing a second time, and logging twice
    // while the fallback flickered. This is not a redundant check.
    if (previousState.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false })
    }
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <main className="flex min-h-screen items-center justify-center px-3 py-10 md:p-8">
        <div className="flex w-full max-w-md flex-col gap-8 rounded-4xl border border-page bg-surface px-4 py-8 md:px-12 md:py-12">
          <h1 className="text-subtitle font-semibold text-offwhite">Algo deu errado</h1>
          <p className="text-paragraph-sm text-muted">
            Não foi possível exibir esta página. Volte para o feed para continuar navegando no
            Code Connect.
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
