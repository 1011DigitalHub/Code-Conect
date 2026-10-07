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
  // Every caller today passes a hardcoded literal ('/cadastro', '/login',
  // ...), so this never fires in practice — it's here so the first caller
  // that ever passes API-sourced data fails loudly instead of quietly
  // becoming a javascript: URL XSS vector. react-router's <Link> does not
  // validate this itself.
  if (!href.startsWith('/')) {
    throw new Error(`TextLink: href must be a relative path starting with "/", got "${href}"`)
  }

  return (
    <Link
      to={href}
      className={`inline-flex items-center gap-3 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${variantClasses[variant]}`}
      {...props}
    />
  )
}
