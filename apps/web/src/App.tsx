import { BrowserRouter, Route, Routes } from 'react-router'
import { ErrorBoundary } from './components/organisms/ErrorBoundary'
import { FeedPage } from './pages/FeedPage'
import { LoginPage } from './pages/LoginPage'
import { NewPostPage } from './pages/NewPostPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PostPage } from './pages/PostPage'
import { ProfilePage } from './pages/ProfilePage'
import { SignUpPage } from './pages/SignUpPage'

function App() {
  return (
    <BrowserRouter>
      {/* Inside the router so the fallback can link anywhere, and around the
          routes so a throw in any page is caught instead of blanking the app. */}
      <ErrorBoundary>
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
          {/* Last: anything unmatched, including a slug that no longer exists. */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  )
}

export default App
