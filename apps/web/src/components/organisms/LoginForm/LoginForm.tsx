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

type FieldErrors = { email?: string; password?: string }

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
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  function validate(): boolean {
    const errors: FieldErrors = {}
    if (!values.email.trim()) {
      errors.email = 'Email é obrigatório'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
      errors.email = 'Email inválido'
    }
    if (!values.password) {
      errors.password = 'Senha é obrigatória'
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!validate()) return
    onSubmit(values)
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <FormField
        id="email"
        name="email"
        type="email"
        label="Email"
        placeholder="Digite seu email"
        autoComplete="email"
        required
        value={values.email}
        error={fieldErrors.email}
        onChange={(event) => {
          setValues({ ...values, email: event.target.value })
          if (fieldErrors.email) setFieldErrors({ ...fieldErrors, email: undefined })
        }}
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
          error={fieldErrors.password}
          onChange={(event) => {
            setValues({ ...values, password: event.target.value })
            if (fieldErrors.password) setFieldErrors({ ...fieldErrors, password: undefined })
          }}
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
