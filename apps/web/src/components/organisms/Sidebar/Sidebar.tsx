import { useLocation } from 'react-router'
import { Logo } from '../../atoms/Logo'
import { NavItem } from '../../molecules/NavItem'
import { SessionLink } from '../../molecules/SessionLink'

export type SidebarProps = {
  authenticated: boolean
  onSignOut: () => void
}

// Responsive with CSS only: a horizontal bar below md, a vertical rail from
// md up. Deliberately no hamburger — a disclosure widget would add a toggle
// button, aria-expanded, Escape handling and a focus trap, which is a lot of
// accessibility surface and extra tab stops for no functional gain at this
// size.
//
// The private entries are hidden when signed out, so a visitor is never
// offered a link that would bounce them to the login page.
export function Sidebar({ authenticated, onSignOut }: SidebarProps) {
  const { pathname } = useLocation()

  return (
    <nav
      aria-label="Menu principal"
      className="flex shrink-0 flex-col gap-6 border-b border-surface px-4 py-6 md:w-64 md:gap-20 md:border-b-0 md:border-r md:px-6 md:py-10"
    >
      <Logo />
      <ul className="flex flex-wrap items-center gap-x-6 gap-y-3 md:flex-col md:items-start">
        <li>
          <NavItem to="/" icon="comment" label="Feed" current={pathname === '/'} />
        </li>
        {authenticated && (
          <>
            <li>
              <NavItem
                to="/posts/novo"
                icon="plus"
                label="Novo post"
                current={pathname === '/posts/novo'}
              />
            </li>
            <li>
              <NavItem
                to="/perfil"
                icon="clipboard"
                label="Perfil"
                current={pathname === '/perfil'}
              />
            </li>
          </>
        )}
        <li className="md:mt-2">
          <SessionLink authenticated={authenticated} onSignOut={onSignOut} />
        </li>
      </ul>
    </nav>
  )
}
