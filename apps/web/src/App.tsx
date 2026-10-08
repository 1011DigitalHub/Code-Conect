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
// boundary needs the current path to know when to clear a caught error.
function RoutedApp() {
  const { pathname } = useLocation()

  return (
    <ErrorBoundary resetKey={pathname}>
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
