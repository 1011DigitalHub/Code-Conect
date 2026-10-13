import { useState, type FormEvent } from 'react'
import { Button } from '../../atoms/Button'
import { FormError } from '../../atoms/FormError'
import { Icon } from '../../atoms/Icon'
import { CheckboxField } from '../../molecules/CheckboxField'
import { FormField } from '../../molecules/FormField'

export type SignUpFormValues = {
  name: string
  email: string
  password: string
  remember: boolean
}

export type SignUpFormProps = {
  onSubmit: (values: SignUpFormValues) => void
  submitting?: boolean
  error?: string
}

type FieldErrors = { name?: string; email?: string; password?: string }

export function SignUpForm({ onSubmit, submitting = false, error }: SignUpFormProps) {
  const [values, setValues] = useState<SignUpFormValues>({
    name: '',
    email: '',
    password: '',
    remember: false,
  })
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  function validate(): boolean {
    const errors: FieldErrors = {}
    if (!values.name.trim()) {
      errors.name = 'Nome é obrigatório'
    }
    if (!values.email.trim()) {
      errors.email = 'Email é obrigatório'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
      errors.email = 'Email inválido'
    }
    if (!values.password) {
      errors.password = 'Senha é obrigatória'
    } else if (values.password.length < 8) {
      errors.password = 'Senha deve ter no mínimo 8 caracteres'
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
        id="name"
        name="name"
        label="Nome"
        placeholder="Nome completo"
        autoComplete="name"
        maxLength={100}
        required
        value={values.name}
        error={fieldErrors.name}
        onChange={(event) => {
          setValues({ ...values, name: event.target.value })
          if (fieldErrors.name) setFieldErrors({ ...fieldErrors, name: undefined })
        }}
      />
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
          autoComplete="new-password"
          minLength={8}
          maxLength={72}
          hint="Mínimo de 8 caracteres"
          required
          value={values.password}
          error={fieldErrors.password}
          onChange={(event) => {
            setValues({ ...values, password: event.target.value })
            if (fieldErrors.password) setFieldErrors({ ...fieldErrors, password: undefined })
          }}
        />
        <CheckboxField
          id="remember"
          name="remember"
          label="Lembrar-me"
          checked={values.remember}
          onChange={(event) => setValues({ ...values, remember: event.target.checked })}
        />
      </div>
      <div className="mt-4 flex flex-col gap-4">
        <FormError message={error} />
        <Button
          type="submit"
          fullWidth
          disabled={submitting}
          icon={<Icon name="arrow-right" size="sm" />}
        >
          {submitting ? 'Cadastrando...' : 'Cadastrar'}
        </Button>
      </div>
    </form>
  )
}
