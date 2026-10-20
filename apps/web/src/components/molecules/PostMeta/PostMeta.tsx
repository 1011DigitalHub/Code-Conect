import { cva, type VariantProps } from 'class-variance-authority'
import { Avatar } from '../../atoms/Avatar'
import { formatRelativeTime } from '../../../lib/formatRelativeTime'

const metaRoot = cva('flex items-center gap-2 text-paragraph-sm', {
  variants: {
    variant: {
      default: 'text-muted',
      inverted: 'text-surface',
    },
  },
  defaultVariants: { variant: 'default' },
})

const metaAuthor = cva('', {
  variants: {
    variant: {
      default: 'text-offwhite',
      inverted: 'text-surface',
    },
  },
  defaultVariants: { variant: 'default' },
})

export type PostMetaProps = VariantProps<typeof metaRoot> & {
  authorName: string
  createdAt: string
  // Injectable so tests are deterministic.
  now?: Date
}

const absoluteFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' })

// The relative label is the readable part; the <time datetime> carries the
// machine-readable instant and `title` the exact date, so nothing is lost by
// showing "há 2 dias".
export function PostMeta({ authorName, createdAt, variant, now }: PostMetaProps) {
  const date = new Date(createdAt)

  return (
    <div className={metaRoot({ variant })}>
      <Avatar name={authorName} />
      <span className={metaAuthor({ variant })}>{authorName}</span>
      <span aria-hidden="true">·</span>
      <time dateTime={createdAt} title={absoluteFormatter.format(date)}>
        {formatRelativeTime(createdAt, now)}
      </time>
    </div>
  )
}
