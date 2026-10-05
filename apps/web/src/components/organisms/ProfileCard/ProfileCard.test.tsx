import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProfileCard } from './ProfileCard'
import { expectNoA11yViolations } from '../../../test/axe'

const user = {
  name: 'Ana Souza',
  email: 'ana@exemplo.com',
  createdAt: '2026-10-02T12:00:00.000Z',
}

describe('ProfileCard', () => {
  it('shows the name, email and sign-up date', () => {
    render(<ProfileCard user={user} onLogout={vi.fn()} />)

    expect(screen.getByText('Ana Souza')).toBeInTheDocument()
    expect(screen.getByText('ana@exemplo.com')).toBeInTheDocument()
    expect(screen.getByText('2 de outubro de 2026')).toBeInTheDocument()
  })

  it('calls onLogout when "Sair" is clicked', async () => {
    const onLogout = vi.fn()
    render(<ProfileCard user={user} onLogout={onLogout} />)

    await userEvent.click(screen.getByRole('button', { name: 'Sair' }))

    expect(onLogout).toHaveBeenCalledOnce()
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = render(<ProfileCard user={user} onLogout={vi.fn()} />)

    await expectNoA11yViolations(container)
  })
})
