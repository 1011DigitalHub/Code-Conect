import { PostCard, type PostCardPost } from '../PostCard'

export type PostListProps = {
  posts: PostCardPost[]
  authenticated: boolean
  pendingSlug?: string | null
  onToggleLike: (slug: string) => void
  now?: Date
}

// How many cards are fetched eagerly. The first is the LCP candidate and gets
// fetchPriority="high"; the next two are likely above the fold, so they are
// eager too but at normal priority — loading="lazy" on a visible image can
// itself delay the LCP. Everything below that is lazy.
const EAGER_CARDS = 3

export function PostList({
  posts,
  authenticated,
  pendingSlug,
  onToggleLike,
  now,
}: PostListProps) {
  return (
    <ul
      aria-label="Posts do feed"
      className="grid gap-6 md:grid-cols-2 xl:grid-cols-3"
    >
      {posts.map((post, index) => (
        <li key={post.slug}>
          <PostCard
            post={post}
            authenticated={authenticated}
            priority={index === 0}
            eager={index > 0 && index < EAGER_CARDS}
            pending={pendingSlug === post.slug}
            onToggleLike={onToggleLike}
            now={now}
          />
        </li>
      ))}
    </ul>
  )
}
