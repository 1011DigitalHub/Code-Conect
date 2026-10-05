import { fireEvent, render, screen } from '@testing-library/react'
import { PostThumbnail } from './PostThumbnail'
import { expectNoA11yViolations } from '../../../test/axe'

describe('PostThumbnail', () => {
  it('renders the placeholder and no image at all when there is no cover', () => {
    const { container } = render(<PostThumbnail src={null} alt="" />)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    // No <img> means no request and no 404 in the network panel.
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('renders the image with its intrinsic size and lazy loading by default', () => {
    render(<PostThumbnail src="/posts/capa.webp" alt="" />)

    const image = document.querySelector('img')
    expect(image).toHaveAttribute('src', '/posts/capa.webp')
    expect(image).toHaveAttribute('width', '640')
    expect(image).toHaveAttribute('height', '360')
    expect(image).toHaveAttribute('loading', 'lazy')
  })

  it('fetches the LCP candidate eagerly and with high priority', () => {
    render(<PostThumbnail src="/posts/capa.webp" alt="Capa" priority />)

    const image = screen.getByRole('img', { name: 'Capa' })
    expect(image).toHaveAttribute('fetchpriority', 'high')
    expect(image).not.toHaveAttribute('loading')
  })

  it('loads an above-the-fold image eagerly but at normal priority', () => {
    render(<PostThumbnail src="/posts/capa.webp" alt="Capa" eager />)

    const image = screen.getByRole('img', { name: 'Capa' })
    expect(image).not.toHaveAttribute('loading')
    expect(image).not.toHaveAttribute('fetchpriority')
  })

  it('falls back to the placeholder when the image fails to load', () => {
    const { container } = render(<PostThumbnail src="/posts/sumiu.webp" alt="" />)

    fireEvent.error(container.querySelector('img') as HTMLImageElement)

    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('tries again when the src changes after a failure', () => {
    const { container, rerender } = render(
      <PostThumbnail src="/posts/sumiu.webp" alt="" />,
    )
    fireEvent.error(container.querySelector('img') as HTMLImageElement)
    expect(container.querySelector('img')).toBeNull()

    rerender(<PostThumbnail src="/posts/existe.webp" alt="" />)

    expect(container.querySelector('img')).toHaveAttribute('src', '/posts/existe.webp')
  })

  it('treats an empty alt as decorative', () => {
    render(<PostThumbnail src="/posts/capa.webp" alt="" />)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = render(<PostThumbnail src="/posts/capa.webp" alt="Capa" />)

    await expectNoA11yViolations(container)
  })

  it('has no WCAG 2.2 AA violations without a cover', async () => {
    const { container } = render(<PostThumbnail src={null} alt="" />)

    await expectNoA11yViolations(container)
  })
})
