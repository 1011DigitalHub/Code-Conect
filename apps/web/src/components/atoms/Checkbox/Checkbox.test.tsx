import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Checkbox } from './Checkbox'

describe('Checkbox', () => {
  it('toggles when clicked', async () => {
    render(<Checkbox aria-label="Lembrar-me" />)
    const checkbox = screen.getByRole('checkbox', { name: 'Lembrar-me' })

    await userEvent.click(checkbox)
    expect(checkbox).toBeChecked()

    await userEvent.click(checkbox)
    expect(checkbox).not.toBeChecked()
  })
})
