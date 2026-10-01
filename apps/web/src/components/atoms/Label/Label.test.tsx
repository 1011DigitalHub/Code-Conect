import { render, screen } from '@testing-library/react'
import { Label } from './Label'
import { expectNoA11yViolations } from '../../../test/axe'

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

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = render(
      <>
        <Label htmlFor="password">Senha</Label>
        <input id="password" />
      </>,
    )

    await expectNoA11yViolations(container)
  })
})
