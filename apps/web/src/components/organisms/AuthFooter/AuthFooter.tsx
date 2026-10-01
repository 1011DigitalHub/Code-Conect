import { Icon, type IconName } from '../../atoms/Icon'
import { TextLink } from '../../atoms/TextLink'

type AuthFooterLayout = 'stacked' | 'inline'

const layoutClasses: Record<AuthFooterLayout, string> = {
  stacked: 'flex-col items-center text-paragraph-sm',
  inline: 'flex-col items-start text-lg sm:flex-row sm:items-center',
}

export type AuthFooterProps = {
  question: string
  linkLabel: string
  href: string
  icon?: IconName
  layout?: AuthFooterLayout
}

export function AuthFooter({ question, linkLabel, href, icon, layout = 'stacked' }: AuthFooterProps) {
  return (
    <p className={`flex gap-2 text-offwhite ${layoutClasses[layout]}`}>
      {question}
      <TextLink href={href} variant="primary">
        {linkLabel}
        {icon && <Icon name={icon} />}
      </TextLink>
    </p>
  )
}
