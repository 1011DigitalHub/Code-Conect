import { screen, waitFor } from '@testing-library/react'
import { expectNoA11yViolations } from '../../test/axe'
import { renderWithRouter } from '../../test/renderWithRouter'
import { NotFoundPage } from './NotFoundPage'

function metaDescription() {
  return document.querySelector('meta[name="description"]')?.getAttribute('content')
}

describe('NotFoundPage', () => {
  it('names the problem in its heading', () => {
    renderWithRouter(<NotFoundPage />)

    expect(screen.getByRole('heading', { level: 1, name: 'Página não encontrada' })).toBeInTheDocument()
  })

  it('offers a way back to the feed', () => {
    renderWithRouter(<NotFoundPage />)

    expect(screen.getByRole('link', { name: 'Voltar para o feed' })).toHaveAttribute('href', '/')
  })

  it('titles and describes the page', async () => {
    renderWithRouter(<NotFoundPage />)

    // usePageMeta writes both from an effect.
    await waitFor(() => expect(document.title).toBe('Página não encontrada | Code Connect'))
    expect(metaDescription()?.length).toBeGreaterThanOrEqual(50)
    expect(metaDescription()?.length).toBeLessThanOrEqual(160)
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = renderWithRouter(<NotFoundPage />)

    await expectNoA11yViolations(container)
  })
})
