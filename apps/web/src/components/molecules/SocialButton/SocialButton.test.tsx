import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SocialButton } from './SocialButton'
import { expectNoA11yViolations } from '../../../test/axe'

describe('SocialButton', () => {
  it('shows the provider name as visible text', () => {
    render(<SocialButton name="Google" icon="/icons/google.svg" />)

    expect(screen.getByText('Google')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Google' })).toBeInTheDocument()
  })

  it('renders the logo as a decorative image', () => {
    const { container } = render(<SocialButton name="Google" icon="/icons/google.svg" />)
    const logo = container.querySelector('img')

    expect(logo).toHaveAttribute('src', '/icons/google.svg')
    expect(logo).toHaveAttribute('alt', '')
  })

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn()
    render(<SocialButton name="Google" icon="/icons/google.svg" onClick={onClick} />)

    await userEvent.click(screen.getByRole('button', { name: 'Google' }))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = render(<SocialButton name="Google" icon="/icons/google.svg" />)

    await expectNoA11yViolations(container)
  })

  it('can be disabled, and then ignores a click', async () => {
    const onClick = vi.fn()
    render(<SocialButton name="Google" icon="/icons/google.svg" onClick={onClick} disabled />)

    const button = screen.getByRole('button', { name: 'Google' })
    expect(button).toBeDisabled()
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('has no WCAG 2.2 AA violations when disabled', async () => {
    const { container } = render(
      <SocialButton name="Google" icon="/icons/google.svg" disabled />,
    )

    await expectNoA11yViolations(container)
  })
})
