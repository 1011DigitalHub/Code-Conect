import axios, { type InternalAxiosRequestConfig } from 'axios'
import { ensureCsrfToken, resetCsrfToken } from './csrf'

export const DEFAULT_API_URL = 'http://localhost:3000'

const UNSAFE_METHODS = new Set(['post', 'put', 'patch', 'delete'])

// A flag stamped directly on the request config, not tracked by reference
// (e.g. in a WeakSet): axios's mergeConfig() builds a new config object on
// every retry, so identity-based tracking would never recognize a retried
// request and would loop forever. A property copied onto the config itself
// survives that merge and is the standard way to mark "already retried".
type RetriableConfig = InternalAxiosRequestConfig & { _csrfRetried?: boolean }

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? DEFAULT_API_URL,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
  // The session travels in an httpOnly cookie, invisible to JS: the browser
  // needs to be told to send and accept credentials across the CORS
  // boundary.
  withCredentials: true,
})

// Every unsafe method (anything but GET/HEAD/OPTIONS) must carry the
// csrf_token cookie's value in X-CSRF-Token — see the API's CsrfGuard.
// Bootstraps a token first if none is set yet (e.g. a visitor's first POST).
api.interceptors.request.use(async (config) => {
  const method = config.method?.toLowerCase()
  if (method && UNSAFE_METHODS.has(method)) {
    const token = await ensureCsrfToken()
    if (token) {
      config.headers.set('X-CSRF-Token', token)
    }
  }
  return config
})

// A 403 means the csrf_token cookie is missing or stale (e.g. rotated by a
// login that happened in another tab): refetch it and retry exactly once.
// The page decides where to go next for anything else, including a 401
// (there is no token here to forget — the cookie is the server's call).
api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) return Promise.reject(error)

    const config = error.config as RetriableConfig | undefined
    if (error.response?.status === 403 && config && !config._csrfRetried) {
      config._csrfRetried = true
      resetCsrfToken()
      await ensureCsrfToken()
      return api(config)
    }

    return Promise.reject(error)
  },
)
