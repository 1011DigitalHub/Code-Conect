import { api, API_BASE_URL } from './client'
import type { LoginBody, LoginResponse, SessionResponse, User } from './types'

export async function login(body: LoginBody): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>('/auth/login', body)
  return data
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout')
}

export async function getMe(signal?: AbortSignal): Promise<User> {
  const { data } = await api.get<User>('/auth/me', { signal })
  return data
}

// For pages that render for anonymous and logged-in visitors alike: answers
// 200 with `user: null` instead of the 401 getMe gives, so probing the session
// on a public page doesn't log a browser console error. Private pages keep
// using getMe, whose 401 is what tells them to redirect.
export async function getSession(signal?: AbortSignal): Promise<SessionResponse> {
  const { data } = await api.get<SessionResponse>('/auth/session', { signal })
  return data
}

// A real page navigation, not an Axios call: the whole OIDC flow is browser
// redirects (to the provider, back to the API, back here), so there is
// nothing to await — the browser leaves this page as soon as this runs. See
// plan/LoginSocial.md section 6.
export function startOidcLogin(providerId: string): void {
  window.location.href = `${API_BASE_URL}/auth/oidc/${providerId}/start`
}

// Confirms linking an OIDC identity to the existing local account that
// shares its email — the one step of the flow that *is* a normal XHR call,
// since by this point the person is filling in a form on /vincular-conta,
// not being redirected anywhere (see plan/LoginSocial.md section 4).
export async function linkOidcAccount(password: string): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>('/auth/oidc/link', { password })
  return data
}
