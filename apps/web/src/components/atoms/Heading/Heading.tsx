import type { ReactNode } from 'react'

type HeadingLevel = 1 | 2

const levelClasses: Record<HeadingLevel, string> = {
  1: 'text-4xl font-semibold',
  2: 'text-2xl font-normal',
}

export type HeadingProps = {
  level?: HeadingLevel
  children: ReactNode
}

export function Heading({ level = 1, children }: HeadingProps) {
  const Tag = level === 1 ? 'h1' : 'h2'

  return <Tag className={`text-offwhite ${levelClasses[level]}`}>{children}</Tag>
}
