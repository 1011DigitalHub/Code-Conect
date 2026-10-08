import { useState, type FormEvent } from 'react'
import { Button } from '../../atoms/Button'
import { FormError } from '../../atoms/FormError'
import { FormField } from '../../molecules/FormField'

export type LinkAccountFormValues = {
  password: string
}

export type LinkAccountFormProps = {
  onSubmit: (values: LinkAccountFormValues) => void
  submitting?: boolean
  error?: string
}

export function LinkAccountForm({ onSubmit, submitting = false, error }: LinkAccountFormProps) {
  const [password, setPassword] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit({ password })
  }

  return (
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
  )
}
