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

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = render(<Icon name="arrow-right" />)

    await expectNoA11yViolations(container)
  })
})
