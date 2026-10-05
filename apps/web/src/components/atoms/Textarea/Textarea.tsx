import { cva, type VariantProps } from 'class-variance-authority'
import type { TextareaHTMLAttributes } from 'react'

// Mirrors the Input atom, so a form field looks the same whether it holds one
// line or several.
const textarea = cva(
  'w-full resize-y rounded bg-input px-4 py-2 text-paragraph-sm text-page placeholder:text-surface focus:outline-2 focus:outline-offset-2 focus:outline-primary',
  {
    variants: {
      invalid: {
        true: 'outline-2 outline-danger',
        false: '',
      },
    },
    defaultVariants: {
      invalid: false,
    },
  },
)

export type TextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'className'
> &
  VariantProps<typeof textarea>

export function Textarea({ invalid, rows = 4, ...props }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      aria-invalid={invalid || undefined}
      className={textarea({ invalid })}
      {...props}
    />
  )
}
