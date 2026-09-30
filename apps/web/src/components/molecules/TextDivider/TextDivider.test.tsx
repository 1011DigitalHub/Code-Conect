import { render, screen } from '@testing-library/react'
import { TextDivider } from './TextDivider'

describe('TextDivider', () => {
  it('renders the text between two separators', () => {
    render(<TextDivider>ou entre com outras contas</TextDivider>)

    expect(screen.getByText('ou entre com outras contas')).toBeInTheDocument()
    expect(screen.getAllByRole('separator')).toHaveLength(2)
  })
})
