import { screen } from '@testing-library/react'
import { Pagination } from './Pagination'
import { renderWithRouter } from '../../../test/renderWithRouter'
import { expectNoA11yViolations } from '../../../test/axe'

const buildHref = (page: number) => `/?page=${page}`

describe('Pagination', () => {
  it('renders nothing when everything fits on one page', () => {
    const { container } = renderWithRouter(
      <Pagination page={1} totalPages={1} buildHref={buildHref} />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('hides the previous link on the first page', () => {
    renderWithRouter(<Pagination page={1} totalPages={3} buildHref={buildHref} />)

    expect(
      screen.queryByRole('link', { name: 'Página anterior' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Próxima página' })).toHaveAttribute(
      'href',
      '/?page=2',
    )
  })

  it('hides the next link on the last page', () => {
    renderWithRouter(<Pagination page={3} totalPages={3} buildHref={buildHref} />)

    expect(
      screen.queryByRole('link', { name: 'Próxima página' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Página anterior' })).toHaveAttribute(
      'href',
      '/?page=2',
    )
  })

  it('offers both links in the middle and says where you are', () => {
    renderWithRouter(<Pagination page={2} totalPages={3} buildHref={buildHref} />)

    expect(screen.getByRole('link', { name: 'Página anterior' })).toHaveAttribute(
      'href',
      '/?page=1',
    )
    expect(screen.getByRole('link', { name: 'Próxima página' })).toHaveAttribute(
      'href',
      '/?page=3',
    )
    expect(screen.getByText('Página 2 de 3')).toBeInTheDocument()
  })

  it('is a named navigation landmark', () => {
    renderWithRouter(<Pagination page={2} totalPages={3} buildHref={buildHref} />)

    expect(screen.getByRole('navigation', { name: 'Paginação' })).toBeInTheDocument()
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = renderWithRouter(
      <Pagination page={2} totalPages={3} buildHref={buildHref} />,
    )

    await expectNoA11yViolations(container)
  })
})
