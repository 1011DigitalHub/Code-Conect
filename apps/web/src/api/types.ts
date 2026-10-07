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

// GET /auth/session: null means "anonymous visitor", not "request failed".
export type SessionResponse = {
  user: User | null
}

export type LoginBody = {
  email: string
  password: string
  remember?: boolean
}

export type CreateUserBody = LoginBody & {
  name: string
}

export type PostAuthor = {
  id: number
  name: string
  self: string
}

export type Pagination = {
  page: number
  perPage: number
  total: number
  totalPages: number
}

export type CollectionLinks = {
  self: string
  next: string | null
  prev: string | null
}

export type PostLinks = {
  self: string
  comments: string
  like: string
  author: string
}

// Feed representation: no `content`, which only the single-post endpoint returns.
export type FeedPost = {
  slug: string
  title: string
  excerpt: string
  thumbnailUrl: string | null
  createdAt: string
  author: PostAuthor
  likeCount: number
  commentCount: number
  likedByMe: boolean
  links: PostLinks
}

export type PostDetail = FeedPost & {
  content: string
}

export type Comment = {
  id: number
  body: string
  createdAt: string
  author: PostAuthor
  links: { self: string; post: string }
}

export type PostCollection = {
  data: FeedPost[]
  pagination: Pagination
  links: CollectionLinks
}

export type CommentCollection = {
  data: Comment[]
  pagination: Pagination
  links: CollectionLinks
}

export type ListPostsParams = {
  q?: string
  page?: number
  perPage?: number
}

export type CreatePostBody = {
  title: string
  excerpt: string
  content: string
  thumbnailUrl?: string
}

export type CreateCommentBody = {
  body: string
}
