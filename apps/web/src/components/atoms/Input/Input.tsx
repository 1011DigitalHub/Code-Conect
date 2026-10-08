import { cva, type VariantProps } from 'class-variance-authority'
import type { InputHTMLAttributes } from 'react'

const input = cva(
  'w-full rounded bg-input px-4 py-2 text-paragraph-sm text-page placeholder:text-surface focus:outline-2 focus:outline-offset-2 focus:outline-primary',
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

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & VariantProps<typeof input>

export function Input({ invalid, ...props }: InputProps) {
  return <input aria-invalid={invalid || undefined} className={input({ invalid })} {...props} />
}
