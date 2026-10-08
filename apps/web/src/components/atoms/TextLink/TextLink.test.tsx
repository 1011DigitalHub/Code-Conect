import { screen } from '@testing-library/react'
import { renderWithRouter } from '../../../test/renderWithRouter'
import { TextLink } from './TextLink'
import { expectNoA11yViolations } from '../../../test/axe'

describe('TextLink', () => {
  it('renders a link to the given href', () => {
    renderWithRouter(<TextLink href="/recuperar-senha">Esqueci a senha</TextLink>)

    expect(screen.getByRole('link', { name: 'Esqueci a senha' })).toHaveAttribute(
      'href',
      '/recuperar-senha',
    )
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = renderWithRouter(<TextLink href="/recuperar-senha">Esqueci a senha</TextLink>)

    await expectNoA11yViolations(container)
  })

  it('rejects an href that is not a relative path, closing off a javascript: URL vector', () => {
    // Built at runtime, not a literal, so the no-script-url lint rule (which
    // exists to catch exactly this scheme) doesn't flag the test that
    // proves the guard works.
    const scriptUrl = ['java', 'script:alert(1)'].join('')
    expect(() => renderWithRouter(<TextLink href={scriptUrl}>x</TextLink>)).toThrow(
      /same-origin path/,
    )
    expect(() => renderWithRouter(<TextLink href="http://evil.example.com">x</TextLink>)).toThrow(
      /same-origin path/,
    )
  })

  // "//evil.example" starts with "/", same as a real site-relative path, but
  // a browser resolves it as protocol-relative — an absolute URL on
  // evil.example, not a path on this site. "/\evil.example" reaches the same
  // vector through a leading backslash, which the WHATWG URL Standard
  // normalizes into a second forward slash for http/https. "/\t/evil.example"
  // and "/\n/evil.example" reach it too: the URL parser strips embedded
  // tab/newline characters before resolving, so they normalize into the
  // protocol-relative form above.
  it('rejects a protocol-relative href, closing off an open redirect', () => {
    expect(() => renderWithRouter(<TextLink href="//evil.example">x</TextLink>)).toThrow(
      /same-origin path/,
    )
    expect(() => renderWithRouter(<TextLink href="/\evil.example">x</TextLink>)).toThrow(
      /same-origin path/,
    )
    expect(() =>
      renderWithRouter(<TextLink href={'/\t/evil.example'}>x</TextLink>),
    ).toThrow(/same-origin path/)
    expect(() =>
      renderWithRouter(<TextLink href={'/\n/evil.example'}>x</TextLink>),
    ).toThrow(/same-origin path/)
  })
})
