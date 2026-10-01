import { render, screen } from '@testing-library/react'
import { Logo } from './Logo'

describe('Logo', () => {
  it('renders as a single image named after the brand', () => {
    render(<Logo />)

    expect(screen.getByRole('img', { name: 'Code Connect' })).toBeInTheDocument()
  })
})
