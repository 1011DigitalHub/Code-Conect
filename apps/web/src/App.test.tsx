import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useNavigate } from 'react-router'
import { RoutedApp } from './App'

// The feed fails once and then works, which is what makes the reset observable:
// a page that always throws would keep the fallback on screen whether the
// boundary reset or not.
const feed = vi.hoisted(() => ({ broken: true }))

vi.mock('./pages/FeedPage', () => ({
  FeedPage: () => {
    if (feed.broken) throw new Error('feed quebrou')
    return <p>Feed carregado</p>
  },
}))

// Rendered beside RoutedApp, inside the router but outside the boundary, so it
// still works while the fallback is showing.
function GoToFeed() {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => void navigate('/')}>
      ir para o feed
    </button>
  )
}

describe('App routing', () => {
  beforeEach(() => {
    feed.broken = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.mocked(console.error).mockRestore()
  })

  // Regression guard for the resetKey wiring. The boundary gets location.key
  // rather than location.pathname, because the feed keeps its search term and
  // page in the query string: going from /?page=2 to / leaves the pathname
  // identical, so a pathname-keyed boundary never resets and strands the
  // viewer on the fallback. That exact bug shipped twice in review.
  it('clears a caught error when only the query string changes', async () => {
    render(
      <MemoryRouter initialEntries={['/?page=2']}>
        <RoutedApp />
        <GoToFeed />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Algo deu errado' })).toBeInTheDocument()

    feed.broken = false
    await userEvent.click(screen.getByRole('button', { name: 'ir para o feed' }))

    expect(screen.getByText('Feed carregado')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Algo deu errado' })).not.toBeInTheDocument()
  })

  it('renders the not found page for an address that matches no route', () => {
    render(
      <MemoryRouter initialEntries={['/nao-existe']}>
        <RoutedApp />
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('heading', { level: 1, name: 'Página não encontrada' }),
    ).toBeInTheDocument()
  })
})
