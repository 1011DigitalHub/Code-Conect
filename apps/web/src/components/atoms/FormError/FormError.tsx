export type FormErrorProps = {
  message?: string
}

// Form-level error (for example "Email ou senha inválidos."). The "Erro:" prefix means the
// message does not rely on color alone, and role="alert" makes screen readers announce it.
export function FormError({ message }: FormErrorProps) {
  if (!message) return null

  return (
    <p role="alert" className="text-sm text-danger">
      <span className="font-semibold">Erro: </span>
      {message}
    </p>
  )
}
