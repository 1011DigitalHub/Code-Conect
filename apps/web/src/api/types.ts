// Shapes of the API responses and bodies. They mirror the Swagger document (/api/docs).

export type User = {
  id: number
  name: string
  email: string
  createdAt: string
  links: { self: string }
}

export type TokenResponse = {
  accessToken: string
  tokenType: 'Bearer'
  expiresIn: number
}

export type LoginBody = {
  email: string
  password: string
}

export type CreateUserBody = LoginBody & {
  name: string
}
