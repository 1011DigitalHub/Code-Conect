import { Icon } from '../../atoms/Icon'
import { TextLink } from '../../atoms/TextLink'
import { LikeButton } from '../../molecules/LikeButton'
import { PostMeta } from '../../molecules/PostMeta'
import { PostThumbnail } from '../../molecules/PostThumbnail'

// Only what the card renders. Declared here rather than imported from
// src/api/, which components may never reach into; the shape is structurally
// satisfied by the API's FeedPost, so a page can pass one straight through.
export type PostCardPost = {
  slug: string
  title: string
  excerpt: string
  thumbnailUrl: string | null
  createdAt: string
  author: { name: string }
  likeCount: number
  commentCount: number
  likedByMe: boolean
}

export type PostCardProps = {
  post: PostCardPost
  authenticated: boolean
  // The LCP candidate: at most one card per page gets this.
  priority?: boolean
  // Above the fold but not the LCP.
  eager?: boolean
  pending?: boolean
  onToggleLike: (slug: string) => void
  now?: Date
}

// Exactly two focusable controls when signed in: the title link and the like
// control. The comment count is plain text, not a link — one more control per
// card would add nine tab stops to the feed for no gain, since the title link
// already goes to the post and its comments.
export function PostCard({
  post,
  authenticated,
  priority,
  eager,
  pending,
  onToggleLike,
  now,
}: PostCardProps) {
  return (
    <article className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
      <PostThumbnail
        // Convention: public/posts/<slug>.webp — authors drop a cover there
        // and the card picks it up; onError in PostThumbnail falls back to
        // the SVG placeholder when the file doesn't exist.
        src={post.thumbnailUrl ?? `/posts/${post.slug}.webp`}
        srcSet={
          post.thumbnailUrl
            ? undefined
            : `/posts/${post.slug}-400.webp 400w, /posts/${post.slug}.webp 800w`
        }
        // Decorative: the title sits right beside it as a link, so a
        // description here would just be read twice.
        alt=""
        priority={priority}
        eager={eager}
      />

      <h2 className="text-paragraph-lg">
        <TextLink href={`/posts/${post.slug}`} variant="primary">
          {post.title}
        </TextLink>
      </h2>

      {/* No line-clamp: a fixed-height clip hides text when the WCAG 1.4.12
          text-spacing override grows the line height past what the clamp
          allows, which the browser accessibility suite catches as content
          loss. Cards are simply uneven in height instead. */}
      <p className="text-paragraph-sm text-muted">{post.excerpt}</p>

      <PostMeta authorName={post.author.name} createdAt={post.createdAt} now={now} />

      <div className="flex items-center gap-4">
        {authenticated ? (
          <LikeButton
            authenticated
            liked={post.likedByMe}
            count={post.likeCount}
            postTitle={post.title}
            pending={pending}
            onToggle={() => onToggleLike(post.slug)}
          />
        ) : (
          <LikeButton
            authenticated={false}
            count={post.likeCount}
            postTitle={post.title}
          />
        )}

        {/* Spelled out visibly rather than with a sr-only suffix: hidden text
            is indistinguishable, to the browser suite's text-spacing check,
            from text a fixed box is clipping — and visible text serves
            everyone, not just assistive technology, anyway. */}
        <p className="flex items-center gap-2 text-paragraph-sm text-muted">
          <Icon name="comment" size="sm" />
          <span>
            {post.commentCount} {post.commentCount === 1 ? 'comentário' : 'comentários'}
          </span>
        </p>
      </div>
    </article>
  )
}
