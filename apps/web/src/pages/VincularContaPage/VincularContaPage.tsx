import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { linkOidcAccount } from '../../api/auth'
import { getErrorMessage, isUnauthorized } from '../../api/errors'
import { Button } from '../../components/atoms/Button'
import { FormError } from '../../components/atoms/FormError'
import { FormField } from '../../components/molecules/FormField'
import { CenteredTemplate } from '../../components/templates/CenteredTemplate'
import { usePageMeta } from '../usePageMeta'

// Display-only: the ?provider= query param never decides which identity
// gets linked — that comes from the signed linking_token cookie the API set
// on the redirect here. An unrecognized or missing value just falls back to
// generic copy.
const PROVIDER_LABELS: Record<string, string> = { google: 'Google', microsoft: 'Microsoft' }

// Deliberately the same message for "linking_token expirado/inválido" and
// "senha incorreta" — see plan/LoginSocial.md section 4: distinguishing the
// two would tell an attacker which half of their guess was wrong.
function linkErrorMessage(error: unknown): string {
  if (isUnauthorized(error)) {
    return 'Não foi possível concluir a vinculação. Verifique a senha ou refaça o login social.'
  }
  return getErrorMessage(error)
}

export function VincularContaPage() {
  usePageMeta(
    'Vincular conta',
    'Confirme a senha da sua conta Code Connect para vincular o login social a ela.',
  )

  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const providerLabel = PROVIDER_LABELS[searchParams.get('provider') ?? ''] ?? 'essa conta'

  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(undefined)
    try {
      // The server sets the session cookie on this response; there is
      // nothing left for the client to store.
      await linkOidcAccount(password)
    } catch (linkError) {
      setError(linkErrorMessage(linkError))
      setSubmitting(false)
      return
    }
    await navigate('/perfil')
  }

  return (
    <CenteredTemplate title="Vincular conta">
      <p className="text-paragraph-sm text-muted">
        Já existe uma conta com este email no Code Connect. Digite sua senha para vincular o login
        com {providerLabel} a ela.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField
          id="password"
          name="password"
          type="password"
          label="Senha"
          placeholder="******"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <FormError message={error} />
        <Button type="submit" fullWidth disabled={submitting}>
          {submitting ? 'Vinculando...' : 'Vincular conta'}
        </Button>
      </form>
    </CenteredTemplate>
  )
}
