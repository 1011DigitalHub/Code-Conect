import { render, screen } from '@testing-library/react'
import { BrandSymbol } from './BrandSymbol'
import { expectNoA11yViolations } from '../../../test/axe'

describe('BrandSymbol', () => {
  it('is hidden from assistive technology', () => {
    const { container } = render(<BrandSymbol />)

    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryAllByRole('img')).toHaveLength(0)
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = render(<BrandSymbol />)

    await expectNoA11yViolations(container)
  })
})
