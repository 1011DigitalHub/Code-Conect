import { render, screen } from '@testing-library/react'
import { Label } from './Label'

describe('Label', () => {
  it('labels the associated control', () => {
    render(
      <>
        <Label htmlFor="password">Senha</Label>
        <input id="password" />
      </>,
    )

    expect(screen.getByLabelText('Senha')).toHaveAttribute('id', 'password')
  })
})
