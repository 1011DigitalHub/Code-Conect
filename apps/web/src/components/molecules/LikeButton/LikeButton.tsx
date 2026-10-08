import { Button } from '../../atoms/Button'
import { Icon } from '../../atoms/Icon'
import { TextLink } from '../../atoms/TextLink'

type LikeButtonBase = {
  count: number
  // Part of the accessible name. Mandatory, not cosmetic: a feed page has one
  // of these per card, and the browser accessibility suite collects the
  // accessible name of every control into a Set and asserts it reached them
  // all — nine controls all called "Curtir" would collapse into one entry.
  postTitle: string
}

export type LikeButtonProps = LikeButtonBase &
  (
    | {
        authenticated: true
        liked: boolean
        pending?: boolean
        onToggle: () => void
      }
    | { authenticated: false }
  )

function countLabel(count: number): string {
  return count === 1 ? '1 curtida' : `${count} curtidas`
}

export function LikeButton(props: LikeButtonProps) {
  const { count, postTitle } = props

  // Signed out this is a link to the login page, never a disabled button:
  // a disabled control is counted by the accessibility suite's selector but
  // cannot receive focus, so it would fail the "reaches every control with
  // Tab" check outright — and a link is a far better call to action than a
  // dead control anyway.
  if (!props.authenticated) {
    return (
      <TextLink
        href="/login"
        variant="primary"
        aria-label={`Entre para curtir o post ${postTitle}. ${countLabel(count)}.`}
      >
        <Icon name="heart" />
        <span aria-hidden="true">{count}</span>
      </TextLink>
    )
  }

  const { liked, pending, onToggle } = props
  const verb = liked ? 'Remover a curtida do post' : 'Curtir o post'

  return (
    <Button
      variant="ghost"
      aria-pressed={liked}
      aria-label={`${verb} ${postTitle}. ${countLabel(count)}.`}
      disabled={pending}
      onClick={onToggle}
    >
      {/* The shape changes with the state, so it never relies on colour alone. */}
      <Icon name={liked ? 'heart-filled' : 'heart'} />
      <span aria-hidden="true">{count}</span>
    </Button>
  )
}
