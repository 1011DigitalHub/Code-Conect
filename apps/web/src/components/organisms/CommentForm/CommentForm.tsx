import { useState } from 'react'
import { Button } from '../../atoms/Button'
import { FormError } from '../../atoms/FormError'
import { TextLink } from '../../atoms/TextLink'
import { TextareaField } from '../../molecules/TextareaField'

const COMMENT_MAX_LENGTH = 1000

export type CommentFormProps = {
  authenticated: boolean
  pending?: boolean
  error?: string
  onSubmit: (body: string) => void
}

export function CommentForm({
  authenticated,
  pending,
  error,
  onSubmit,
}: CommentFormProps) {
  const [body, setBody] = useState('')
  const [validationError, setValidationError] = useState<string>()

  // Signed out there is no form at all — not a disabled one. A disabled
  // control cannot be focused, which would break the browser suite's Tab
  // traversal check, and a call to action is more useful than a dead field.
  if (!authenticated) {
    return (
      <p className="text-paragraph-sm text-muted">
        <TextLink href="/login" variant="primary">
          Entre para comentar
        </TextLink>{' '}
        neste post.
      </p>
    )
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = body.trim()
    if (!trimmed) {
      setValidationError('Escreva um comentário antes de enviar.')
      return
    }
    setValidationError(undefined)
    onSubmit(trimmed)
    setBody('')
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <TextareaField
        id="comment-body"
        label="Seu comentário"
        value={body}
        maxLength={COMMENT_MAX_LENGTH}
        hint={`Até ${COMMENT_MAX_LENGTH} caracteres.`}
        error={validationError}
        onChange={(event) => setBody(event.target.value)}
      />
      <FormError message={error} />
      <div className="self-start">
        <Button type="submit" disabled={pending}>
          {pending ? 'Enviando...' : 'Comentar'}
        </Button>
      </div>
    </form>
  )
}
