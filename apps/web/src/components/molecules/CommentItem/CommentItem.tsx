import { PostMeta } from '../PostMeta'

export type CommentItemProps = {
  authorName: string
  createdAt: string
  body: string
  now?: Date
}

export function CommentItem({ authorName, createdAt, body, now }: CommentItemProps) {
  return (
    <article className="flex flex-col gap-2 rounded-2xl bg-surface p-4">
      <PostMeta authorName={authorName} createdAt={createdAt} now={now} />
      {/* Preserves the line breaks the author typed without allowing markup. */}
      <p className="text-paragraph-sm whitespace-pre-line text-offwhite">{body}</p>
    </article>
  )
}
