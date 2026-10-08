import { cva, type VariantProps } from 'class-variance-authority'

const avatar = cva(
  'inline-flex shrink-0 items-center justify-center rounded-full bg-ink font-semibold text-primary',
  {
    variants: {
      size: {
        sm: 'size-8 text-label',
        md: 'size-10 text-paragraph-sm',
      },
    },
    defaultVariants: {
      size: 'sm',
    },
  },
)

export type AvatarProps = VariantProps<typeof avatar> & {
  name: string
}

// Up to two initials, so "Ana Souza" reads as AS and "Ana" as A.
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]
  if (!first) return '?'
  const last = parts.length > 1 ? parts.at(-1) : undefined
  return (first.charAt(0) + (last?.charAt(0) ?? '')).toUpperCase()
}

// Decorative: the author's name is always rendered as text next to it, so
// announcing the initials again would just repeat it.
export function Avatar({ name, size }: AvatarProps) {
  return (
    <span aria-hidden="true" className={avatar({ size })}>
      {initials(name)}
    </span>
  )
}
