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

// Fixed, arbitrary origin used only to ask the URL parser "where would a
// browser actually send this?" — never sent anywhere.
const ORIGIN_CHECK_BASE = 'https://textlink.invalid'

// Client-side navigation through react-router, so moving between pages doesn't reload the app.
export function TextLink({ href, variant, ...props }: TextLinkProps) {
  // The feed builds hrefs from API data (`/posts/${post.slug}`), so this is a
  // live check, not a theoretical one: it fails loudly instead of quietly
  // becoming a javascript: URL XSS vector or an open redirect. react-router's
  // <Link> does not validate this itself.
  //
  // Checked by outcome, not by prefix: resolve href with the same WHATWG URL
  // parser a browser uses, against a fixed base, and require the result to
  // land back on that base's origin. A prefix denylist has to enumerate every
  // string that normalizes into a cross-origin URL — "//evil.example"
  // (protocol-relative), "/\evil.example" (the WHATWG URL Standard treats a
  // leading backslash as a second forward slash for special schemes like
  // http/https, in every modern browser, not just some), and "/\t/evil.example"
  // (the parser strips embedded tab/newline/CR characters before resolving,
  // so this normalizes to the protocol-relative form above) — and it's easy
  // to miss one, as the tab/newline case was missed here originally. Checking
  // the resolved origin instead closes all of these, including variants not
  // enumerated above, in one comparison.
  let resolvedOrigin: string
  try {
    resolvedOrigin = new URL(href, ORIGIN_CHECK_BASE).origin
  } catch {
    resolvedOrigin = ''
  }
  if (!href.startsWith('/') || resolvedOrigin !== ORIGIN_CHECK_BASE) {
    throw new Error(`TextLink: href must be a same-origin path starting with "/", got "${href}"`)
  }

  return <Link to={href} className={textLink({ variant })} {...props} />
}
