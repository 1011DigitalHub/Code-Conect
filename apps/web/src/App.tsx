import { BrowserRouter, Route, Routes } from 'react-router'
import { FeedPage } from './pages/FeedPage'
import { LoginPage } from './pages/LoginPage'
import { NewPostPage } from './pages/NewPostPage'
import { PostPage } from './pages/PostPage'
import { ProfilePage } from './pages/ProfilePage'
import { SignUpPage } from './pages/SignUpPage'

function App() {
  return (
    <BrowserRouter>
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
      </Routes>
    </BrowserRouter>
  )
}

export default App
