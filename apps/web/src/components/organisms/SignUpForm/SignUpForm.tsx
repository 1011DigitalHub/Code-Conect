import { useState, type FormEvent } from 'react'
import { Button } from '../../atoms/Button'
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
}

export function SignUpForm({ onSubmit }: SignUpFormProps) {
  const [values, setValues] = useState<SignUpFormValues>({
    name: '',
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
        id="name"
        name="name"
        label="Nome"
        placeholder="Nome completo"
        autoComplete="name"
        required
        value={values.name}
        onChange={(event) => setValues({ ...values, name: event.target.value })}
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
        onChange={(event) => setValues({ ...values, email: event.target.value })}
      />
      <div className="flex flex-col gap-2">
        <FormField
          id="password"
          name="password"
          type="password"
          label="Senha"
          placeholder="******"
          autoComplete="new-password"
          required
          value={values.password}
          onChange={(event) => setValues({ ...values, password: event.target.value })}
        />
        <CheckboxField
          id="remember"
          name="remember"
          label="Lembrar-me"
          checked={values.remember}
          onChange={(event) => setValues({ ...values, remember: event.target.checked })}
        />
      </div>
      <div className="mt-4">
        <Button type="submit" fullWidth icon={<Icon name="arrow-right" size="sm" />}>
          Cadastrar
        </Button>
      </div>
    </form>
  )
}
