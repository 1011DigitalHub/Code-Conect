import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted font, only the weights the design uses (no render-blocking third-party CSS).
import '@fontsource/prompt/400.css'
import '@fontsource/prompt/600.css'
import '@fontsource/roboto-mono/400.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
