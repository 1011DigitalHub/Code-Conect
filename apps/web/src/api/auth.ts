import { api } from './client'
import type { LoginBody, TokenResponse, User } from './types'

export async function login(body: LoginBody): Promise<TokenResponse> {
  const { data } = await api.post<TokenResponse>('/auth/login', body)
  return data
}

export async function getMe(signal?: AbortSignal): Promise<User> {
  const { data } = await api.get<User>('/auth/me', { signal })
  return data
}
