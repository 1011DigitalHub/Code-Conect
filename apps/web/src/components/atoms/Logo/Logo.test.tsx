import { render, screen } from '@testing-library/react'
import { Logo } from './Logo'
import { expectNoA11yViolations } from '../../../test/axe'

describe('Logo', () => {
  it('renders as a single image named after the brand', () => {
    render(<Logo />)

    expect(screen.getByRole('img', { name: 'Code Connect' })).toBeInTheDocument()
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = render(<Logo />)

    await expectNoA11yViolations(container)
  })
})
