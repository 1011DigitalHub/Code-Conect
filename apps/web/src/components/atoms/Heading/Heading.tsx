import { cva, type VariantProps } from 'class-variance-authority'
import type { ReactNode } from 'react'

const heading = cva('', {
  variants: {
    level: {
      1: 'text-subtitle font-semibold',
      2: 'text-paragraph-lg font-normal',
    },
    color: {
      default: 'text-offwhite',
      dark: 'text-surface',
    },
  },
  defaultVariants: {
    level: 1,
    color: 'default',
  },
})

export type HeadingProps = VariantProps<typeof heading> & {
  children: ReactNode
}

export function Heading({ level, color, children }: HeadingProps) {
  const Tag = level === 2 ? 'h2' : 'h1'

  return <Tag className={heading({ level, color })}>{children}</Tag>
}
