import { render, screen } from '@testing-library/react'
import { BrandSymbol } from './BrandSymbol'

describe('BrandSymbol', () => {
  it('is hidden from assistive technology', () => {
    const { container } = render(<BrandSymbol />)

    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryAllByRole('img')).toHaveLength(0)
  })
})
