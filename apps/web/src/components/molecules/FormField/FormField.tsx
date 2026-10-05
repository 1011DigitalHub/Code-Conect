import { Input, type InputProps } from '../../atoms/Input'
import { Label } from '../../atoms/Label'

export type FormFieldProps = Omit<InputProps, 'id' | 'invalid'> & {
  id: string
  label: string
  error?: string
  hint?: string
}

export function FormField({ id, label, error, hint, ...inputProps }: FormFieldProps) {
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ')

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        invalid={Boolean(error)}
        aria-describedby={describedBy || undefined}
        {...inputProps}
      />
      {hint && (
        <p id={hintId} className="text-label text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
