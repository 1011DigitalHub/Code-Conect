import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { linkOidcAccount } from '../../api/auth'
import { getErrorMessage, isConflict, isUnauthorized } from '../../api/errors'
import { TextLink } from '../../components/atoms/TextLink'
import { LinkAccountForm, type LinkAccountFormValues } from '../../components/organisms/LinkAccountForm'
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
  // 409 here means the link that brought the person to this page was
  // already used (or raced by another request) — the API clears it on
  // both outcomes, so there's no password to retry with. getErrorMessage's
  // own 409 copy ("Este email já está cadastrado.") is written for sign-up
  // and would be actively misleading here.
  if (isConflict(error)) {
    return 'Esse link de vinculação já foi usado ou expirou. Clique em "Entrar com Google/Microsoft" novamente para repetir o processo.'
  }
  return getErrorMessage(error)
}

export function LinkAccountPage() {
  usePageMeta(
    'Vincular conta',
    'Confirme a senha da sua conta Code Connect para vincular o login social a ela.',
  )

  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const providerLabel = PROVIDER_LABELS[searchParams.get('provider') ?? ''] ?? 'essa conta'

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>()

  async function handleSubmit(values: LinkAccountFormValues) {
    setSubmitting(true)
    setError(undefined)
    try {
      // The server sets the session cookie on this response; there is
      // nothing left for the client to store.
      await linkOidcAccount(values.password)
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
      <LinkAccountForm onSubmit={handleSubmit} submitting={submitting} error={error} />
      <TextLink href="/login">Voltar ao login</TextLink>
    </CenteredTemplate>
  )
}
