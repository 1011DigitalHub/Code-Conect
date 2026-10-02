import { Button } from '../../atoms/Button'

export type ProfileCardUser = {
  name: string
  email: string
  createdAt: string
}

export type ProfileCardProps = {
  user: ProfileCardUser
  onLogout: () => void
}

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' })

// The data comes from the page as props: components never call the API.
export function ProfileCard({ user, onLogout }: ProfileCardProps) {
  return (
    <div className="flex flex-col gap-8">
      <dl className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <dt className="text-label text-muted">Nome</dt>
          <dd className="text-paragraph-sm break-words">{user.name}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-label text-muted">Email</dt>
          <dd className="text-paragraph-sm break-words">{user.email}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-label text-muted">Membro desde</dt>
          <dd className="text-paragraph-sm">{dateFormatter.format(new Date(user.createdAt))}</dd>
        </div>
      </dl>
      <Button fullWidth onClick={onLogout}>
        Sair
      </Button>
    </div>
  )
}
