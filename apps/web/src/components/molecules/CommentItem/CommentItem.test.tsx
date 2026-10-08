import { render, screen } from '@testing-library/react'
import { CommentItem } from './CommentItem'
import { expectNoA11yViolations } from '../../../test/axe'

const now = new Date('2026-10-05T12:00:00.000Z')

describe('CommentItem', () => {
  it('shows the author and the comment', () => {
    render(
      <CommentItem
        authorName="Bruno Lima"
        createdAt="2026-10-05T11:00:00.000Z"
        body="Muito bom, obrigado!"
        now={now}
      />,
    )

    expect(screen.getByText('Bruno Lima')).toBeInTheDocument()
    expect(screen.getByText('Muito bom, obrigado!')).toBeInTheDocument()
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = render(
      <CommentItem
        authorName="Bruno Lima"
        createdAt="2026-10-05T11:00:00.000Z"
        body="Muito bom, obrigado!"
        now={now}
      />,
    )

    await expectNoA11yViolations(container)
  })
})
