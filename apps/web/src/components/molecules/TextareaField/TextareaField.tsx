import { Label } from '../../atoms/Label'
import { Textarea, type TextareaProps } from '../../atoms/Textarea'

export type TextareaFieldProps = Omit<TextareaProps, 'id' | 'invalid'> & {
  id: string
  label: string
  error?: string
  hint?: string
}

// Mirrors FormField, for the multi-line fields (a comment, a post body).
export function TextareaField({
  id,
  label,
  error,
  hint,
  ...textareaProps
}: TextareaFieldProps) {
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ')

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        invalid={Boolean(error)}
        aria-describedby={describedBy || undefined}
        {...textareaProps}
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
