import { render, screen } from '@testing-library/react'
import { CenteredTemplate } from './CenteredTemplate'
import { expectNoA11yViolations } from '../../../test/axe'

describe('CenteredTemplate', () => {
  it('renders the title as the page heading and the content', () => {
    render(
      <CenteredTemplate title="Perfil">
        <p>Conteúdo da página</p>
      </CenteredTemplate>,
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Perfil' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveTextContent('Conteúdo da página')
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = render(
      <CenteredTemplate title="Perfil">
        <p>Conteúdo da página</p>
      </CenteredTemplate>,
    )

    await expectNoA11yViolations(container)
  })
})
