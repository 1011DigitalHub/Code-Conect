import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SocialButton } from './SocialButton'
import { expectNoA11yViolations } from '../../../test/axe'

describe('SocialButton', () => {
  it('shows the provider name as visible text', () => {
    render(<SocialButton name="Github" icon="/Github-img.png" />)

    expect(screen.getByText('Github')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Github' })).toBeInTheDocument()
  })

  it('renders the logo as a decorative image', () => {
    const { container } = render(<SocialButton name="Github" icon="/Github-img.png" />)
    const logo = container.querySelector('img')

    expect(logo).toHaveAttribute('src', '/Github-img.png')
    expect(logo).toHaveAttribute('alt', '')
  })

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn()
    render(<SocialButton name="Github" icon="/Github-img.png" onClick={onClick} />)

    await userEvent.click(screen.getByRole('button', { name: 'Github' }))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = render(<SocialButton name="Github" icon="/Github-img.png" />)

    await expectNoA11yViolations(container)
  })
})
