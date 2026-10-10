import { Component, type ReactNode, type ErrorInfo } from 'react'

export type CardErrorBoundaryProps = {
  children: ReactNode
}

type CardErrorBoundaryState = {
  failed: boolean
}

// Scoped version of the page-level ErrorBoundary (organisms/ErrorBoundary):
// isolates a single feed card instead of the whole page. Not the TextLink/slug
// vector that motivated issue #18 — PostCard's href is always
// `/posts/${post.slug}`, and that fixed literal prefix anchors the resolved
// URL to this origin no matter what the slug contains (see PostList.test.tsx
// and plan/IsolamentoFalhasFeed.md for how this was confirmed). The realistic
// trigger is any other malformed field a card reads unguarded — a missing
// author, for instance — where, scoped here, only that one card disappears
// from the feed instead of the whole list.
//
// A class component for the same reason as the page-level boundary:
// getDerivedStateFromError/componentDidCatch have no hook equivalent in
// React 19.
//
// No resetKey: PostList already keys each card by post.slug, so a different
// post at the same position remounts a fresh instance on its own. The same
// post re-rendering with the same bad data has nothing to reset to — the
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
