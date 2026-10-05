import { cva, type VariantProps } from 'class-variance-authority'
import { Icon, type IconName } from '../../atoms/Icon'
import { TextLink } from '../../atoms/TextLink'

const authFooter = cva('flex gap-2 text-offwhite', {
  variants: {
    layout: {
      stacked: 'flex-col items-center text-paragraph-sm',
      inline: 'flex-col items-start text-lg sm:flex-row sm:items-center',
    },
  },
  defaultVariants: {
    layout: 'stacked',
  },
})

export type AuthFooterProps = VariantProps<typeof authFooter> & {
  question: string
  linkLabel: string
  href: string
  icon?: IconName
}

export function AuthFooter({ question, linkLabel, href, icon, layout }: AuthFooterProps) {
  return (
    <p className={authFooter({ layout })}>
      {question}
      <TextLink href={href} variant="primary">
        {linkLabel}
        {icon && <Icon name={icon} />}
      </TextLink>
    </p>
  )
}
