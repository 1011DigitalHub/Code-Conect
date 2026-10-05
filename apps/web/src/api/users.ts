import { api } from './client'
import type { CreateUserBody, User } from './types'

export async function createUser(body: CreateUserBody): Promise<User> {
  const { data } = await api.post<User>('/users', body)
  return data
}
