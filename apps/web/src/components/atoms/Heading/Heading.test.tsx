import { render, screen } from '@testing-library/react'
import { Heading } from './Heading'

describe('Heading', () => {
  it('renders an h1 by default', () => {
    render(<Heading>Login</Heading>)

    expect(screen.getByRole('heading', { level: 1, name: 'Login' })).toBeInTheDocument()
  })

  it('renders the requested level', () => {
    render(<Heading level={2}>Boas-vindas!</Heading>)

    expect(screen.getByRole('heading', { level: 2, name: 'Boas-vindas!' })).toBeInTheDocument()
  })
})
