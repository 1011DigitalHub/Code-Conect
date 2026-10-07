// Shapes of the API responses and bodies. They mirror the Swagger document (/api/docs).

export type User = {
  id: number
  name: string
  email: string
  createdAt: string
  links: { self: string }
}

// The session itself travels in an httpOnly cookie set by the server; this
// is just the metadata the login response still carries in its body.
export type LoginResponse = {
  tokenType: 'Bearer'
  expiresIn: number
}

export type LoginBody = {
  email: string
  password: string
  remember?: boolean
}

export type CreateUserBody = LoginBody & {
  name: string
}
