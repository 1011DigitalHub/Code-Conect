import { Icon, type IconName } from '../../atoms/Icon'
import { TextLink } from '../../atoms/TextLink'

export type AuthFooterProps = {
  question: string
  linkLabel: string
  href: string
  icon?: IconName
}

export function AuthFooter({ question, linkLabel, href, icon }: AuthFooterProps) {
  return (
    <p className="flex flex-col items-center gap-3 text-offwhite">
      {question}
      <TextLink href={href} variant="primary">
        {linkLabel}
        {icon && <Icon name={icon} />}
      </TextLink>
    </p>
  )
}
