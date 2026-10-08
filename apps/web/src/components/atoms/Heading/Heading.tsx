import { cva, type VariantProps } from 'class-variance-authority'
import type { ReactNode } from 'react'

const heading = cva('text-offwhite', {
  variants: {
    level: {
      1: 'text-subtitle font-semibold',
      2: 'text-paragraph-lg font-normal',
    },
  },
  defaultVariants: {
    level: 1,
  },
})

export type HeadingProps = VariantProps<typeof heading> & {
  children: ReactNode
}

export function Heading({ level, children }: HeadingProps) {
  const Tag = level === 2 ? 'h2' : 'h1'

  return <Tag className={heading({ level })}>{children}</Tag>
}
