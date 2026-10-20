import { CodeBlock } from '../../atoms/CodeBlock'
import { Heading } from '../../atoms/Heading'
import { Icon } from '../../atoms/Icon'
import { LikeButton } from '../../molecules/LikeButton'
import { PostMeta } from '../../molecules/PostMeta'
import { PostThumbnail } from '../../molecules/PostThumbnail'

export type PostArticlePost = {
  slug: string
  title: string
  content: string
  code?: string | null
  thumbnailUrl: string | null
  createdAt: string
  author: { name: string }
  likeCount: number
  commentCount: number
  likedByMe: boolean
}

export type PostArticleProps = {
  post: PostArticlePost
  authenticated: boolean
  pending?: boolean
  onToggleLike: () => void
  now?: Date
}

// Splits the stored body on blank lines into paragraphs. No markdown
// renderer: that would mean a new dependency, and rendering stored markup
// would mean dangerouslySetInnerHTML and an XSS surface for no real gain.
function paragraphsOf(content: string): string[] {
  return content
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
}

export function PostArticle({
  post,
  authenticated,
  pending,
  onToggleLike,
  now,
}: PostArticleProps) {
  return (
    <article className="flex flex-col gap-6">
      {/* The post's own title is the page's h1, which is what the SEO suite
          and the heading order both want. */}
      <Heading level={1}>{post.title}</Heading>

      <PostMeta authorName={post.author.name} createdAt={post.createdAt} now={now} />

      <PostThumbnail
        src={post.thumbnailUrl}
        // Informative here: it is the article's own illustration, and there
        // is no adjacent link naming it.
        alt={post.thumbnailUrl ? `Capa do post ${post.title}` : ''}
        priority
      />

      <div className="flex flex-col gap-4">
        {paragraphsOf(post.content).map((paragraph, index) => (
          <p key={index} className="text-lg text-offwhite">
            {paragraph}
          </p>
        ))}
      </div>

      {post.code && (
        <div className="flex flex-col gap-2">
          <Heading level={2}>Código:</Heading>
          <CodeBlock code={post.code} />
        </div>
      )}

      <div className="flex items-center gap-4">
        {authenticated ? (
          <LikeButton
            authenticated
            liked={post.likedByMe}
            count={post.likeCount}
            postTitle={post.title}
            pending={pending}
            onToggle={onToggleLike}
          />
        ) : (
          <LikeButton
            authenticated={false}
            count={post.likeCount}
            postTitle={post.title}
          />
        )}

        <span className="flex items-center gap-1 text-paragraph-sm text-muted">
          <Icon name="comment" size="sm" />
          <span aria-label={`${post.commentCount} comentários`}>{post.commentCount}</span>
        </span>
      </div>
    </article>
  )
}
