import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SocialLogin } from './SocialLogin'
import { expectNoA11yViolations } from '../../../test/axe'

const providers = [
  { id: 'google', name: 'Google', icon: '/icons/google.svg' },
  { id: 'microsoft', name: 'Microsoft', icon: '/icons/microsoft.svg' },
]

describe('SocialLogin', () => {
  it('renders one button per provider', () => {
    render(<SocialLogin providers={providers} onSelect={vi.fn()} />)

    expect(screen.getByText('ou entre com outras contas')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Google' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Microsoft' })).toBeInTheDocument()
  })

  it('calls onSelect with the chosen provider id', async () => {
    const onSelect = vi.fn()
    render(<SocialLogin providers={providers} onSelect={onSelect} />)

    await userEvent.click(screen.getByRole('button', { name: 'Google' }))

    expect(onSelect).toHaveBeenCalledWith('google')
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = render(<SocialLogin providers={providers} onSelect={vi.fn()} />)

    await expectNoA11yViolations(container)
  })

  it('disables every button and renders fine with no onSelect at all', async () => {
    const { container } = render(<SocialLogin providers={providers} disabled />)

    expect(screen.getByRole('button', { name: 'Google' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Microsoft' })).toBeDisabled()
    await expectNoA11yViolations(container)
  })
})
