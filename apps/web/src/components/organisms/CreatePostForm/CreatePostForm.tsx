import { useState } from 'react'
import { Button } from '../../atoms/Button'
import { FormError } from '../../atoms/FormError'
import { Icon } from '../../atoms/Icon'
import { FormField } from '../../molecules/FormField'
import { TextareaField } from '../../molecules/TextareaField'

// Mirror the API's DTO constraints, so the person sees the problem before the
// request is made rather than as a 400.
const TITLE_MIN = 3
const TITLE_MAX = 120
const EXCERPT_MIN = 50
const EXCERPT_MAX = 160
const CONTENT_MIN = 20
const CONTENT_MAX = 10_000

export type CreatePostValues = {
  title: string
  excerpt: string
  content: string
  thumbnailUrl?: string
}

export type CreatePostFormProps = {
  pending?: boolean
  error?: string
  onSubmit: (values: CreatePostValues) => void
}

type Errors = Partial<Record<'title' | 'excerpt' | 'content' | 'thumbnailUrl', string>>

function validate(values: CreatePostValues): Errors {
  const errors: Errors = {}

  if (values.title.length < TITLE_MIN) {
    errors.title = `O título precisa de pelo menos ${TITLE_MIN} caracteres.`
  } else if (values.title.length > TITLE_MAX) {
    errors.title = `O título pode ter no máximo ${TITLE_MAX} caracteres.`
  }

  if (values.excerpt.length < EXCERPT_MIN) {
    errors.excerpt = `O resumo precisa de pelo menos ${EXCERPT_MIN} caracteres.`
  } else if (values.excerpt.length > EXCERPT_MAX) {
    errors.excerpt = `O resumo pode ter no máximo ${EXCERPT_MAX} caracteres.`
  }

  if (values.content.length < CONTENT_MIN) {
    errors.content = `O conteúdo precisa de pelo menos ${CONTENT_MIN} caracteres.`
  }

  if (values.thumbnailUrl && !/^(https?:\/\/|\/)/.test(values.thumbnailUrl)) {
    errors.thumbnailUrl = 'Use um endereço http(s) ou um caminho começando com /.'
  }

  return errors
}

export function CreatePostForm({ pending, error, onSubmit }: CreatePostFormProps) {
  const [title, setTitle] = useState('')
  const [excerpt, setExcerpt] = useState('')
  const [content, setContent] = useState('')
  const [thumbnailUrl, setThumbnailUrl] = useState('')
  const [errors, setErrors] = useState<Errors>({})

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values: CreatePostValues = {
      title: title.trim(),
      excerpt: excerpt.trim(),
      content: content.trim(),
      thumbnailUrl: thumbnailUrl.trim() || undefined,
    }

    const found = validate(values)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    onSubmit(values)
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit} noValidate>
      <FormField
        id="post-title"
        label="Título"
        value={title}
        maxLength={TITLE_MAX}
        error={errors.title}
        onChange={(event) => setTitle(event.target.value)}
      />

      <TextareaField
        id="post-excerpt"
        label="Resumo"
        value={excerpt}
        rows={3}
        maxLength={EXCERPT_MAX}
        // The excerpt doubles as the post page's meta description, which is
        // why the range is what it is.
        hint={`De ${EXCERPT_MIN} a ${EXCERPT_MAX} caracteres. Aparece no feed e nos resultados de busca. ${excerpt.trim().length}/${EXCERPT_MAX}.`}
        error={errors.excerpt}
        onChange={(event) => setExcerpt(event.target.value)}
      />

      <TextareaField
        id="post-content"
        label="Conteúdo"
        value={content}
        rows={10}
        maxLength={CONTENT_MAX}
        hint="Separe os parágrafos com uma linha em branco."
        error={errors.content}
        onChange={(event) => setContent(event.target.value)}
      />

      <FormField
        id="post-thumbnail"
        label="Imagem de capa (opcional)"
        value={thumbnailUrl}
        maxLength={500}
        placeholder="/posts/minha-capa.webp"
        hint="Sem capa, o feed mostra uma imagem padrão."
        error={errors.thumbnailUrl}
        onChange={(event) => setThumbnailUrl(event.target.value)}
      />

      <FormError message={error} />

      <div className="self-start">
        <Button type="submit" disabled={pending} icon={<Icon name="arrow-right" />}>
          {pending ? 'Publicando...' : 'Publicar'}
        </Button>
      </div>
    </form>
  )
}
