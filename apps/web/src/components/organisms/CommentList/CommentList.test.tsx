import { render, screen } from '@testing-library/react'
import { CommentList, type CommentListComment } from './CommentList'
import { expectNoA11yViolations } from '../../../test/axe'

const now = new Date('2026-10-05T12:00:00.000Z')

const comments: CommentListComment[] = [
  {
    id: 1,
    body: 'Muito bom, obrigado!',
    createdAt: '2026-10-05T10:00:00.000Z',
    author: { name: 'Bruno Lima' },
  },
  {
    id: 2,
    body: 'Tem exemplo de código?',
    createdAt: '2026-10-05T11:00:00.000Z',
    author: { name: 'Carla Mendes' },
  },
]

describe('CommentList', () => {
  it('lists every comment in the order it was given', () => {
    render(<CommentList comments={comments} now={now} />)

    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('Muito bom, obrigado!')).toBeInTheDocument()
    expect(screen.getByText('Tem exemplo de código?')).toBeInTheDocument()
  })

  it('heads the section with the count', () => {
    render(<CommentList comments={comments} now={now} />)

    expect(
      screen.getByRole('heading', { level: 2, name: '2 comentários' }),
    ).toBeInTheDocument()
  })

  it('uses the singular for one comment', () => {
    render(<CommentList comments={comments.slice(0, 1)} now={now} />)

    expect(
      screen.getByRole('heading', { level: 2, name: '1 comentário' }),
    ).toBeInTheDocument()
  })

  it('explains the empty state instead of showing a bare list', () => {
    render(<CommentList comments={[]} now={now} />)

    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(
      screen.getByText('Ainda não há comentários neste post.'),
    ).toBeInTheDocument()
  })

  it('wraps the section in the gray bg-input container', () => {
    const { container } = render(<CommentList comments={comments} now={now} />)

    expect(container.firstChild).toHaveClass('bg-input')
  })

  it('renders an hr separator between comments but not before the first', () => {
    render(<CommentList comments={comments} now={now} />)

    const separators = document.querySelectorAll('hr')
    expect(separators).toHaveLength(1)
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = render(<CommentList comments={comments} now={now} />)

    await expectNoA11yViolations(container)
  })

  it('has no WCAG 2.2 AA violations when empty', async () => {
    const { container } = render(<CommentList comments={[]} now={now} />)

    await expectNoA11yViolations(container)
  })
})
