import axios from 'axios'
import { clearToken, getToken } from './tokenStorage'

export const DEFAULT_API_URL = 'http://localhost:3000'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? DEFAULT_API_URL,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
})

// The token travels only in the Authorization header (never in the URL).
api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`)
  }
  return config
})

// A 401 on a request that carried a token means it expired or is invalid: forget it.
// A 401 on login (no token sent) is just a wrong password and keeps the state as is.
// The page decides where to go next.
api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401 &&
      error.config?.headers.has('Authorization')
    ) {
      clearToken()
    }
    return Promise.reject(error)
  },
)
