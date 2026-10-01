import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SocialLogin } from './SocialLogin'
import { expectNoA11yViolations } from '../../../test/axe'

const providers = [
  { id: 'github', name: 'Github', icon: '/Github-img.png' },
  { id: 'google', name: 'Gmail', icon: '/Gmail-img.png' },
]

describe('SocialLogin', () => {
  it('renders one button per provider', () => {
    render(<SocialLogin providers={providers} onSelect={vi.fn()} />)

    expect(screen.getByText('ou entre com outras contas')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Github' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gmail' })).toBeInTheDocument()
  })

  it('calls onSelect with the chosen provider id', async () => {
    const onSelect = vi.fn()
    render(<SocialLogin providers={providers} onSelect={onSelect} />)

    await userEvent.click(screen.getByRole('button', { name: 'Github' }))

    expect(onSelect).toHaveBeenCalledWith('github')
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = render(<SocialLogin providers={providers} onSelect={vi.fn()} />)

    await expectNoA11yViolations(container)
  })
})
