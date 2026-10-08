import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

const button = cva(
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-3 text-lg font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-ink hover:brightness-95 focus-visible:outline-primary',
        // For icon-led controls (like, logout) that sit on a card rather
        // than acting as the page's main action.
        ghost:
          'bg-transparent text-offwhite hover:text-primary focus-visible:outline-primary',
      },
      fullWidth: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'primary',
      fullWidth: false,
    },
  },
)

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> &
  VariantProps<typeof button> & {
    icon?: ReactNode
  }

export function Button({ variant, fullWidth, icon, type = 'button', children, ...props }: ButtonProps) {
  return (
    <button type={type} className={button({ variant, fullWidth })} {...props}>
      {children}
      {icon}
    </button>
  )
}
