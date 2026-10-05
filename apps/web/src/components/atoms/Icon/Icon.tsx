import { cva, type VariantProps } from 'class-variance-authority'
import type { ReactNode } from 'react'

export type IconName = 'arrow-right' | 'clipboard' | 'login'

const icon = cva('shrink-0', {
  variants: {
    size: {
      sm: 'size-4.5',
      md: 'size-6',
    },
  },
  defaultVariants: {
    size: 'md',
  },
})

const paths: Record<IconName, ReactNode> = {
  'arrow-right': (
    <path
      d="M5 12h14m-6-6 6 6-6 6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  clipboard: (
    <path
      fill="currentColor"
      d="M9 2a1 1 0 0 0-1 1v1H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V3a1 1 0 0 0-1-1H9Zm1 2h4v2h-4V4ZM8 10h8v2H8v-2Zm0 4h8v2H8v-2Z"
    />
  ),
  login: (
    <path
      fill="currentColor"
      d="M11 7 9.6 8.4l2.6 2.6H2v2h10.2l-2.6 2.6L11 17l5-5-5-5Zm9 12h-8v2h8c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-8v2h8v14Z"
    />
  ),
}

export type IconProps = {
  name: IconName
} & VariantProps<typeof icon>

export function Icon({ name, size }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={icon({ size })}>
      {paths[name]}
    </svg>
  )
}
