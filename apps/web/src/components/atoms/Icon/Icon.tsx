import { cva, type VariantProps } from 'class-variance-authority'
import type { ReactNode } from 'react'

export type IconName =
  | 'arrow-right'
  | 'clipboard'
  | 'login'
  | 'logout'
  | 'heart'
  | 'heart-filled'
  | 'comment'
  | 'search'
  | 'plus'

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
  logout: (
    <path
      fill="currentColor"
      d="M13 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8v-2H5V5h8V3Zm3.6 4L15.2 8.4 17.8 11H9v2h8.8l-2.6 2.6L16.6 17l5-5-5-5Z"
    />
  ),
  // Outline and filled hearts are separate names so the like button can swap
  // the shape, not just the color — the state must not rely on color alone.
  heart: (
    <path
      d="M12 20.3 4.8 13a4.7 4.7 0 0 1 6.7-6.6l.5.5.5-.5A4.7 4.7 0 0 1 19.2 13L12 20.3Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  ),
  'heart-filled': (
    <path
      fill="currentColor"
      d="M12 20.3 4.8 13a4.7 4.7 0 0 1 6.7-6.6l.5.5.5-.5A4.7 4.7 0 0 1 19.2 13L12 20.3Z"
    />
  ),
  comment: (
    <path
      fill="currentColor"
      d="M20 2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3v4l5.3-4H20a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z"
    />
  ),
  search: (
    <path
      fill="currentColor"
      d="M10 2a8 8 0 1 0 4.9 14.3l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0 0 10 2Zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z"
    />
  ),
  plus: <path fill="currentColor" d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z" />,
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
