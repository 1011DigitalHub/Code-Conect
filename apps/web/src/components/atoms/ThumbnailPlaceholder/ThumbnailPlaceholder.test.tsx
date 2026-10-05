import { render } from '@testing-library/react'
import { ThumbnailPlaceholder } from './ThumbnailPlaceholder'
import { expectNoA11yViolations } from '../../../test/axe'

describe('ThumbnailPlaceholder', () => {
  it('renders decorative art that screen readers ignore', () => {
    const { container } = render(<ThumbnailPlaceholder />)

    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })

  it('reserves a 16:9 box so swapping it for an image cannot shift the layout', () => {
    const { container } = render(<ThumbnailPlaceholder />)

    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('viewBox', '0 0 640 360')
    expect(svg).toHaveClass('aspect-video')
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = render(<ThumbnailPlaceholder />)

    await expectNoA11yViolations(container)
  })
})
