import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LikeButton } from './LikeButton'
import { renderWithRouter } from '../../../test/renderWithRouter'
import { expectNoA11yViolations } from '../../../test/axe'

const postTitle = 'Componentes React na prática'

describe('LikeButton, signed in', () => {
  it('reports the unliked state and toggles', async () => {
    const onToggle = vi.fn()
    renderWithRouter(
      <LikeButton
        authenticated
        liked={false}
        count={4}
        postTitle={postTitle}
        onToggle={onToggle}
      />,
    )

    const button = screen.getByRole('button', {
      name: `Curtir o post ${postTitle}. 4 curtidas.`,
    })
    expect(button).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(button)
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('reports the liked state with the opposite action in its name', () => {
    renderWithRouter(
      <LikeButton
        authenticated
        liked
        count={5}
        postTitle={postTitle}
        onToggle={vi.fn()}
      />,
    )

    const button = screen.getByRole('button', {
      name: `Remover a curtida do post ${postTitle}. 5 curtidas.`,
    })
    expect(button).toHaveAttribute('aria-pressed', 'true')
  })

  it('names the post, so two cards never share an accessible name', () => {
    renderWithRouter(
      <>
        <LikeButton
          authenticated
          liked={false}
          count={1}
          postTitle="Primeiro post"
          onToggle={vi.fn()}
        />
        <LikeButton
          authenticated
          liked={false}
          count={1}
          postTitle="Segundo post"
          onToggle={vi.fn()}
        />
      </>,
    )

    const names = screen
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'))
    expect(new Set(names).size).toBe(2)
  })

  it('says "1 curtida" in the singular', () => {
    renderWithRouter(
      <LikeButton
        authenticated
        liked={false}
        count={1}
        postTitle={postTitle}
        onToggle={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('button', { name: `Curtir o post ${postTitle}. 1 curtida.` }),
    ).toBeInTheDocument()
  })

  it('shows the count visibly but hides it from the accessible name', () => {
    const { container } = renderWithRouter(
      <LikeButton
        authenticated
        liked={false}
        count={7}
        postTitle={postTitle}
        onToggle={vi.fn()}
      />,
    )

    expect(container.querySelector('span[aria-hidden="true"]')).toHaveTextContent('7')
  })

  it('is enabled on an idle render and disabled only while a toggle is in flight', () => {
    const { rerender } = renderWithRouter(
      <LikeButton
        authenticated
        liked={false}
        count={4}
        postTitle={postTitle}
        onToggle={vi.fn()}
      />,
    )
    expect(screen.getByRole('button')).toBeEnabled()

    rerender(
      <LikeButton
        authenticated
        liked={false}
        count={4}
        postTitle={postTitle}
        pending
        onToggle={vi.fn()}
      />,
    )
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = renderWithRouter(
      <LikeButton
        authenticated
        liked={false}
        count={4}
        postTitle={postTitle}
        onToggle={vi.fn()}
      />,
    )

    await expectNoA11yViolations(container)
  })
})

describe('LikeButton, signed out', () => {
  it('invites the visitor to log in instead of offering a dead control', () => {
    renderWithRouter(<LikeButton authenticated={false} count={4} postTitle={postTitle} />)

    const link = screen.getByRole('link', {
      name: `Entre para curtir o post ${postTitle}. 4 curtidas.`,
    })
    expect(link).toHaveAttribute('href', '/login')
  })

  it('renders no button at all, let alone a disabled one', () => {
    // A disabled button is counted by the accessibility suite's selector but
    // cannot be focused, which would fail its Tab traversal check.
    const { container } = renderWithRouter(
      <LikeButton authenticated={false} count={4} postTitle={postTitle} />,
    )

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(container.querySelector('button')).toBeNull()
    expect(container.querySelector('[disabled]')).toBeNull()
  })

  it('still shows the like count', () => {
    renderWithRouter(<LikeButton authenticated={false} count={4} postTitle={postTitle} />)

    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('has no WCAG 2.2 AA violations', async () => {
    const { container } = renderWithRouter(
      <LikeButton authenticated={false} count={4} postTitle={postTitle} />,
    )

    await expectNoA11yViolations(container)
  })
})
