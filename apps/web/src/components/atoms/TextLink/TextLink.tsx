import type { ComponentProps } from 'react'
import { Link } from 'react-router'

type TextLinkVariant = 'underline' | 'primary'

const variantClasses: Record<TextLinkVariant, string> = {
  underline: 'text-paragraph-sm text-offwhite underline underline-offset-2 hover:text-primary',
  primary: 'text-lg text-primary hover:brightness-110',
}

export type TextLinkProps = Omit<ComponentProps<typeof Link>, 'className' | 'to'> & {
  href: string
  variant?: TextLinkVariant
}

// Client-side navigation through react-router, so moving between pages doesn't reload the app.
export function TextLink({ href, variant = 'underline', ...props }: TextLinkProps) {
  return (
    <Link
      to={href}
      className={`inline-flex items-center gap-3 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${variantClasses[variant]}`}
      {...props}
    />
  )
}
