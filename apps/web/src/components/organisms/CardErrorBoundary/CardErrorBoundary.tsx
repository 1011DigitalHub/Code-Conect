import { Component, type ReactNode, type ErrorInfo } from 'react'

export type CardErrorBoundaryProps = {
  children: ReactNode
}

type CardErrorBoundaryState = {
  failed: boolean
}

// Scoped version of the page-level ErrorBoundary (organisms/ErrorBoundary):
// isolates a single feed card instead of the whole page. The likeliest
// trigger is the same one that motivates the page-level boundary — TextLink
// throwing on a post whose slug is not a safe same-origin path — but scoped
// here, only that one card disappears from the feed instead of the whole list.
//
// A class component for the same reason as the page-level boundary:
// getDerivedStateFromError/componentDidCatch have no hook equivalent in
// React 19.
//
// No resetKey: PostList already keys each card by post.slug, so a different
// post at the same position remounts a fresh instance on its own. The same
// post re-rendering with the same bad slug has nothing to reset to — the
// props that caused the throw haven't changed.
export class CardErrorBoundary extends Component<CardErrorBoundaryProps, CardErrorBoundaryState> {
  state: CardErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): CardErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('render error caught by a card boundary', error, info.componentStack)
  }

  render() {
    // Silently neutralizes the broken card: nothing on screen, no gap left
    // behind in the grid, and the rest of the feed keeps working.
    if (this.state.failed) return null

    return this.props.children
  }
}
