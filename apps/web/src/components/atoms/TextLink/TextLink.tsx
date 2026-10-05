import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { Link } from 'react-router'

const textLink = cva(
  'inline-flex items-center gap-3 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
  {
    variants: {
      variant: {
        underline: 'text-paragraph-sm text-offwhite underline underline-offset-2 hover:text-primary',
        primary: 'text-lg text-primary hover:brightness-110',
      },
    },
    defaultVariants: {
      variant: 'underline',
    },
  },
)

export type TextLinkProps = Omit<ComponentProps<typeof Link>, 'className' | 'to'> &
  VariantProps<typeof textLink> & {
    href: string
  }

// Client-side navigation through react-router, so moving between pages doesn't reload the app.
export function TextLink({ href, variant, ...props }: TextLinkProps) {
  return <Link to={href} className={textLink({ variant })} {...props} />
}
