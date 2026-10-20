import { cva, type VariantProps } from 'class-variance-authority'
import { PostMeta } from '../PostMeta'

const item = cva('flex flex-col gap-2', {
  variants: {
    variant: {
      default: 'bg-surface rounded-2xl p-4',
      inline: '',
    },
  },
  defaultVariants: { variant: 'default' },
})

const bodyText = cva('text-paragraph-sm whitespace-pre-line', {
  variants: {
    variant: {
      default: 'text-offwhite',
      inline: 'text-surface',
    },
  },
  defaultVariants: { variant: 'default' },
})

export type CommentItemProps = VariantProps<typeof item> & {
  authorName: string
  createdAt: string
  body: string
  now?: Date
}

export function CommentItem({ authorName, createdAt, body, variant, now }: CommentItemProps) {
  return (
    <article className={item({ variant })}>
      <PostMeta
        authorName={authorName}
        createdAt={createdAt}
        now={now}
        variant={variant === 'inline' ? 'inverted' : 'default'}
      />
      {/* Preserves the line breaks the author typed without allowing markup. */}
      <p className={bodyText({ variant })}>{body}</p>
    </article>
  )
}
