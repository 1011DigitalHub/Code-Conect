import { api } from './client'
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
