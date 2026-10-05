import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchField } from './SearchField'
import { expectNoA11yViolations } from '../../../test/axe'

describe('SearchField', () => {
  it('wires the label to the input', () => {
    render(<SearchField id="feed-search" label="Buscar posts" onSubmit={vi.fn()} />)

    expect(screen.getByLabelText('Buscar posts')).toBeInTheDocument()
  })

  it('exposes itself as a search landmark', () => {
    render(<SearchField id="feed-search" label="Buscar posts" onSubmit={vi.fn()} />)

    expect(screen.getByRole('search')).toBeInTheDocument()
  })

  it('submits the typed term with the button', async () => {
    const onSubmit = vi.fn()
    render(<SearchField id="feed-search" label="Buscar posts" onSubmit={onSubmit} />)

    await userEvent.type(screen.getByLabelText('Buscar posts'), 'react hooks')
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }))

    expect(onSubmit).toHaveBeenCalledWith('react hooks')
  })

  it('submits with Enter', async () => {
    const onSubmit = vi.fn()
    render(<SearchField id="feed-search" label="Buscar posts" onSubmit={onSubmit} />)

    await userEvent.type(screen.getByLabelText('Buscar posts'), 'react{Enter}')

    expect(onSubmit).toHaveBeenCalledWith('react')
  })

  it('trims the term', async () => {
    const onSubmit = vi.fn()
    render(<SearchField id="feed-search" label="Buscar posts" onSubmit={onSubmit} />)

    await userEvent.type(screen.getByLabelText('Buscar posts'), '  react  {Enter}')

    expect(onSubmit).toHaveBeenCalledWith('react')
  })

  it('starts from the term already in the URL', () => {
    render(
      <SearchField
        id="feed-search"
        label="Buscar posts"
        defaultValue="postgres"
        onSubmit={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Buscar posts')).toHaveValue('postgres')
  })

  it('submits an empty term, which clears the filter', async () => {
    const onSubmit = vi.fn()
    render(
      <SearchField
        id="feed-search"
        label="Buscar posts"
        defaultValue="react"
        onSubmit={onSubmit}
      />,
    )

    await userEvent.clear(screen.getByLabelText('Buscar posts'))
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }))

    expect(onSubmit).toHaveBeenCalledWith('')
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = render(
      <SearchField id="feed-search" label="Buscar posts" onSubmit={vi.fn()} />,
    )

    await expectNoA11yViolations(container)
  })
})
