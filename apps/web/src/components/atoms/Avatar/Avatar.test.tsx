import { render, screen } from '@testing-library/react'
import { Avatar } from './Avatar'
import { expectNoA11yViolations } from '../../../test/axe'

describe('Avatar', () => {
  it('shows the first and last initials', () => {
    render(<Avatar name="Ana Souza" />)

    expect(screen.getByText('AS')).toBeInTheDocument()
  })

  it('shows one initial for a single-word name', () => {
    render(<Avatar name="Ana" />)

    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('skips the middle names', () => {
    render(<Avatar name="Ana Maria de Souza" />)

    expect(screen.getByText('AS')).toBeInTheDocument()
  })

  it('is hidden from screen readers, since the name is next to it', () => {
    const { container } = render(<Avatar name="Ana Souza" />)

    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = render(<Avatar name="Ana Souza" />)

    await expectNoA11yViolations(container)
  })
})
