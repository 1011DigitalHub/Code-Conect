import { useState, type FormEvent } from 'react'
import { Button } from '../../atoms/Button'
import { Icon } from '../../atoms/Icon'
import { TextLink } from '../../atoms/TextLink'
import { CheckboxField } from '../../molecules/CheckboxField'
import { FormField } from '../../molecules/FormField'

export type LoginFormValues = {
  login: string
  password: string
  remember: boolean
}

export type LoginFormProps = {
  onSubmit: (values: LoginFormValues) => void
  forgotPasswordHref: string
}

export function LoginForm({ onSubmit, forgotPasswordHref }: LoginFormProps) {
  const [values, setValues] = useState<LoginFormValues>({
    login: '',
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
        id="login"
        name="login"
        label="Email ou usuário"
        placeholder="usuario123"
        autoComplete="username"
        required
        value={values.login}
        onChange={(event) => setValues({ ...values, login: event.target.value })}
      />
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
      <div className="mt-4">
        <Button type="submit" fullWidth icon={<Icon name="arrow-right" size="sm" />}>
          Login
        </Button>
      </div>
    </form>
  )
}
