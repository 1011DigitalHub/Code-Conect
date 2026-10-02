import { useState, type FormEvent } from 'react'
import { Button } from '../../atoms/Button'
import { FormError } from '../../atoms/FormError'
import { Icon } from '../../atoms/Icon'
import { TextLink } from '../../atoms/TextLink'
import { CheckboxField } from '../../molecules/CheckboxField'
import { FormField } from '../../molecules/FormField'

export type LoginFormValues = {
  email: string
  password: string
  remember: boolean
}

export type LoginFormProps = {
  onSubmit: (values: LoginFormValues) => void
  forgotPasswordHref: string
  submitting?: boolean
  error?: string
}

export function LoginForm({
  onSubmit,
  forgotPasswordHref,
  submitting = false,
  error,
}: LoginFormProps) {
  const [values, setValues] = useState<LoginFormValues>({
    email: '',
    password: '',
    remember: false,
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit(values)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <FormField
        id="email"
        name="email"
        type="email"
        label="Email"
        placeholder="Digite seu email"
        autoComplete="email"
        required
        value={values.email}
        onChange={(event) => setValues({ ...values, email: event.target.value })}
      />
      <div className="flex flex-col gap-2">
        <FormField
          id="password"
          name="password"
          type="password"
          label="Senha"
          placeholder="******"
          autoComplete="current-password"
          required
          value={values.password}
          onChange={(event) => setValues({ ...values, password: event.target.value })}
        />
        <div className="flex items-center justify-between">
          <CheckboxField
            id="remember"
            name="remember"
            label="Lembrar-me"
            checked={values.remember}
            onChange={(event) => setValues({ ...values, remember: event.target.checked })}
          />
          <TextLink href={forgotPasswordHref}>Esqueci a senha</TextLink>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-4">
        <FormError message={error} />
        <Button
          type="submit"
          fullWidth
          disabled={submitting}
          icon={<Icon name="arrow-right" size="sm" />}
        >
          {submitting ? 'Entrando...' : 'Login'}
        </Button>
      </div>
    </form>
  )
}
