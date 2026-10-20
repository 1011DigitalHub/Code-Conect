import { render, screen } from '@testing-library/react'
import { Heading } from './Heading'
import { expectNoA11yViolations } from '../../../test/axe'

describe('Heading', () => {
  it('renders an h1 by default', () => {
    render(<Heading>Login</Heading>)

    expect(screen.getByRole('heading', { level: 1, name: 'Login' })).toBeInTheDocument()
  })

  it('renders the requested level', () => {
    render(<Heading level={2}>Boas-vindas!</Heading>)

    expect(screen.getByRole('heading', { level: 2, name: 'Boas-vindas!' })).toBeInTheDocument()
  })

  it('applies text-surface for color="dark"', () => {
    const { container } = render(<Heading color="dark">Comentários</Heading>)

    expect(container.firstChild).toHaveClass('text-surface')
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = render(<Heading>Login</Heading>)

    await expectNoA11yViolations(container)
  })
})
