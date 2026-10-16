import { type FormEvent, type ReactNode } from 'react'
import { Button } from '../../atoms/Button'
import { FormError } from '../../atoms/FormError'
import { Icon } from '../../atoms/Icon'

export type AuthFormWrapperProps = {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  submitLabel: string
  submittingLabel: string
  submitting?: boolean
  error?: string
  children: ReactNode
}

export function AuthFormWrapper({
  onSubmit,
  submitLabel,
  submittingLabel,
  submitting = false,
  error,
  children,
}: AuthFormWrapperProps) {
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {children}
      <div className="mt-4 flex flex-col gap-4">
        <FormError message={error} />
        <Button
          type="submit"
          fullWidth
          disabled={submitting}
          icon={<Icon name="arrow-right" size="sm" />}
        >
          {submitting ? submittingLabel : submitLabel}
        </Button>
      </div>
    </form>
  )
}
