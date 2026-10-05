import { BrowserRouter, Route, Routes } from 'react-router'
import { LoginPage } from './pages/LoginPage'
import { ProfilePage } from './pages/ProfilePage'
import { SignUpPage } from './pages/SignUpPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/cadastro" element={<SignUpPage />} />
        <Route path="/perfil" element={<ProfilePage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
