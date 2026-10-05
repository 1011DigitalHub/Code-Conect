import { Button } from '../../atoms/Button'
import { Icon } from '../../atoms/Icon'
import { NavItem } from '../NavItem'

export type SessionLinkProps = {
  authenticated: boolean
  onSignOut: () => void
}

// The one entry in the side menu that changes with the session. Signed out it
// is a link to the login page; signed in it is a button, because signing out
// is an action with a side effect, not navigation.
//
// Either way it is exactly one focusable control, so the number of tab stops
// on the page does not change when the session resolves.
export function SessionLink({ authenticated, onSignOut }: SessionLinkProps) {
  if (!authenticated) {
    return <NavItem to="/login" icon="login" label="Login" />
  }

  return (
    <Button variant="ghost" onClick={onSignOut} icon={<Icon name="logout" />}>
      Sair
    </Button>
  )
}
