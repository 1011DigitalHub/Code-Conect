import { Avatar } from '../../atoms/Avatar'
import { formatRelativeTime } from '../../../lib/formatRelativeTime'

export type PostMetaProps = {
  authorName: string
  createdAt: string
  // Injectable so tests are deterministic.
  now?: Date
}

const absoluteFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' })

// The relative label is the readable part; the <time datetime> carries the
// machine-readable instant and `title` the exact date, so nothing is lost by
// showing "há 2 dias".
export function PostMeta({ authorName, createdAt, now }: PostMetaProps) {
  const date = new Date(createdAt)

  return (
    <div className="flex items-center gap-2 text-paragraph-sm text-muted">
      <Avatar name={authorName} />
      <span className="text-offwhite">{authorName}</span>
      <span aria-hidden="true">·</span>
      <time dateTime={createdAt} title={absoluteFormatter.format(date)}>
        {formatRelativeTime(createdAt, now)}
      </time>
    </div>
  )
}
