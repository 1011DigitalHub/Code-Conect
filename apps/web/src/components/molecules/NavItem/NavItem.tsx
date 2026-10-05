import { Icon, type IconName } from '../../atoms/Icon'
import { TextLink } from '../../atoms/TextLink'

export type NavItemProps = {
  to: string
  icon: IconName
  label: string
  // Marks the entry for the page being viewed (WCAG 2.4.8).
  current?: boolean
}

export function NavItem({ to, icon, label, current }: NavItemProps) {
  return (
    <TextLink href={to} variant="primary" aria-current={current ? 'page' : undefined}>
      <Icon name={icon} />
      {label}
    </TextLink>
  )
}
