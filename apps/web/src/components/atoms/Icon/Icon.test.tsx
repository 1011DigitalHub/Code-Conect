import { render } from '@testing-library/react'
import { Icon } from './Icon'
import { expectNoA11yViolations } from '../../../test/axe'

describe('Icon', () => {
  it('renders a decorative svg hidden from assistive technology', () => {
    const { container } = render(<Icon name="arrow-right" />)

    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders the login icon', () => {
    const { container } = render(<Icon name="login" />)

    expect(container.querySelector('svg path')).toBeInTheDocument()
  })

  it.each([
    'arrow-right',
    'clipboard',
    'login',
    'logout',
    'heart',
    'heart-filled',
    'comment',
    'search',
    'plus',
  ] as const)('renders artwork for %s', (name) => {
    const { container } = render(<Icon name={name} />)

    expect(container.querySelector('svg')?.children.length).toBeGreaterThan(0)
  })

  // The like button swaps the shape, not just the color, so the liked state
  // never relies on color alone.
  it('draws the filled heart differently from the outline one', () => {
    const outline = render(<Icon name="heart" />).container.innerHTML
    const filled = render(<Icon name="heart-filled" />).container.innerHTML

    expect(outline).not.toBe(filled)
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = render(<Icon name="arrow-right" />)

    await expectNoA11yViolations(container)
  })
})
