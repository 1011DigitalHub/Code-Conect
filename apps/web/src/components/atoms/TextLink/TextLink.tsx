import type { AnchorHTMLAttributes } from 'react'

type TextLinkVariant = 'underline' | 'primary'

const variantClasses: Record<TextLinkVariant, string> = {
  underline: 'text-sm text-offwhite underline underline-offset-2 hover:text-primary',
  primary: 'text-lg text-primary hover:brightness-110',
}

export type TextLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className'> & {
  href: string
  variant?: TextLinkVariant
}

export function TextLink({ variant = 'underline', ...props }: TextLinkProps) {
  return (
    <a
      className={`inline-flex items-center gap-2 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${variantClasses[variant]}`}
      {...props}
    />
  )
}
