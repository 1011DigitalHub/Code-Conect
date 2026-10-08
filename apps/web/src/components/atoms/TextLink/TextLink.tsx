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
  // The feed builds hrefs from API data (`/posts/${post.slug}`), so this is a
  // live check, not a theoretical one: it fails loudly instead of quietly
  // becoming a javascript: URL XSS vector. react-router's <Link> does not
  // validate this itself.
  //
  // "/" alone isn't enough: "//evil.example" also starts with "/", but a
  // browser resolves a protocol-relative href like that as an absolute URL
  // on evil.example, not a path on this site — an open redirect from a
  // malicious API value. "/\" is rejected too, since some browsers
  // normalize a leading backslash into a second forward slash before
  // resolving the URL, reaching the same vector through a different string.
  if (!href.startsWith('/') || href.startsWith('//') || href.startsWith('/\\')) {
    throw new Error(`TextLink: href must be a relative path starting with "/", got "${href}"`)
  }

  return <Link to={href} className={textLink({ variant })} {...props} />
}
