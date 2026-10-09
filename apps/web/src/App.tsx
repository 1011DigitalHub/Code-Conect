import { BrowserRouter, Route, Routes, useLocation } from 'react-router'
import { ErrorBoundary } from './components/organisms/ErrorBoundary'
import { FeedPage } from './pages/FeedPage'
import { LoginPage } from './pages/LoginPage'
import { NewPostPage } from './pages/NewPostPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PostPage } from './pages/PostPage'
import { ProfilePage } from './pages/ProfilePage'
import { SignUpPage } from './pages/SignUpPage'

// Separate from App because useLocation only works inside the router, and the
// boundary needs to know when the viewer has navigated.
//
// Exported for App.test.tsx, which renders it inside a MemoryRouter: App's own
// BrowserRouter cannot be navigated from a test, and the resetKey wiring below
// is worth pinning — it has regressed silently before (see plan/TratamentoDeErros.md
// for the history; it rots fast as a code comment).
export function RoutedApp() {
  // location.key, not pathname: the feed keeps its search term and page in the
  // query string (FeedPage's useSearchParams), so going from /?page=2 back to /
  // leaves the pathname unchanged and the fallback would stay on screen.
  // The key is unique per history entry, so it changes on every navigation.
  const { key } = useLocation()

  return (
    <ErrorBoundary resetKey={key}>
      <Routes>
        {/* The feed is the entry point: it is public, so a visitor lands on
            the content rather than on a login form. */}
        <Route path="/" element={<FeedPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/cadastro" element={<SignUpPage />} />
        <Route path="/perfil" element={<ProfilePage />} />
        {/* Before the :slug route for readability; react-router already
            ranks the static segment higher. */}
        <Route path="/posts/novo" element={<NewPostPage />} />
        <Route path="/posts/:slug" element={<PostPage />} />
        {/* Last: an address that matches nothing above. A post slug that does
            not exist is NOT one of these — it still matches /posts/:slug, and
            PostPage renders its own not-found state (see usePostDetail). */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </ErrorBoundary>
  )
}

function App() {
  return (
    <BrowserRouter>
      <RoutedApp />
    </BrowserRouter>
  )
}

export default App

