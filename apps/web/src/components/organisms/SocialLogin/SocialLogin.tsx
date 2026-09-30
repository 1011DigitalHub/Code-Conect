import { SocialButton } from '../../molecules/SocialButton'
import { TextDivider } from '../../molecules/TextDivider'

export type SocialProvider = {
  id: string
  name: string
  icon: string
}

export type SocialLoginProps = {
  providers: SocialProvider[]
  onSelect: (providerId: string) => void
  label?: string
}

export function SocialLogin({
  providers,
  onSelect,
  label = 'ou entre com outras contas',
}: SocialLoginProps) {
  return (
    <section className="flex flex-col gap-3">
      <TextDivider>{label}</TextDivider>
      <ul className="flex justify-center gap-6">
        {providers.map((provider) => (
          <li key={provider.id}>
            <SocialButton
              name={provider.name}
              icon={provider.icon}
              onClick={() => onSelect(provider.id)}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
