import { Heading } from '../../atoms/Heading'
import { CommentItem } from '../../molecules/CommentItem'

export type CommentListComment = {
  id: number
  body: string
  createdAt: string
  author: { name: string }
}

export type CommentListProps = {
  comments: CommentListComment[]
  now?: Date
}

export function CommentList({ comments, now }: CommentListProps) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-input p-6">
      <Heading level={2} color="dark">
        {comments.length === 1 ? '1 comentário' : `${comments.length} comentários`}
      </Heading>

      {comments.length === 0 ? (
        <p className="text-paragraph-sm text-surface/70">
          Ainda não há comentários neste post.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {comments.map((comment, index) => (
            <li key={comment.id}>
              {index > 0 && <hr className="mb-4 border-surface/20" />}
              <CommentItem
                variant="inline"
                authorName={comment.author.name}
                createdAt={comment.createdAt}
                body={comment.body}
                now={now}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
