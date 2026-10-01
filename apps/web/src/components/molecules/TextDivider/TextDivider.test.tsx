import { render, screen } from '@testing-library/react'
import { TextDivider } from './TextDivider'
import { expectNoA11yViolations } from '../../../test/axe'

describe('TextDivider', () => {
  it('renders the text between two separators', () => {
    render(<TextDivider>ou entre com outras contas</TextDivider>)

    expect(screen.getByText('ou entre com outras contas')).toBeInTheDocument()
    expect(screen.getAllByRole('separator')).toHaveLength(2)
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = render(<TextDivider>ou entre com outras contas</TextDivider>)

    await expectNoA11yViolations(container)
  })
})
