import { render, screen } from '@testing-library/react'
import { PostMeta } from './PostMeta'
import { expectNoA11yViolations } from '../../../test/axe'

const now = new Date('2026-10-05T12:00:00.000Z')
const createdAt = '2026-10-03T12:00:00.000Z'

describe('PostMeta', () => {
  it('shows the author name', () => {
    render(<PostMeta authorName="Ana Souza" createdAt={createdAt} now={now} />)

    expect(screen.getByText('Ana Souza')).toBeInTheDocument()
  })

  it('shows the relative time with the exact instant in the markup', () => {
    render(<PostMeta authorName="Ana Souza" createdAt={createdAt} now={now} />)

    const time = screen.getByText('anteontem')
    expect(time).toHaveAttribute('datetime', createdAt)
    // The exact date stays available on hover, so the relative label loses
    // no information.
    expect(time).toHaveAttribute('title', '3 de outubro de 2026')
  })

  it('applies inverted classes in variant="inverted"', () => {
    const { container } = render(
      <PostMeta authorName="Ana Souza" createdAt={createdAt} now={now} variant="inverted" />,
    )

    expect(container.firstChild).toHaveClass('text-surface')
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = render(
      <PostMeta authorName="Ana Souza" createdAt={createdAt} now={now} />,
    )

    await expectNoA11yViolations(container)
  })
})
