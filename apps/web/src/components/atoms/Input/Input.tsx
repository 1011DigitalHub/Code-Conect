import type { InputHTMLAttributes } from 'react'

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & {
  invalid?: boolean
}

export function Input({ invalid = false, ...props }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={`w-full rounded bg-input px-4 py-2 text-paragraph-sm text-page placeholder:text-surface focus:outline-2 focus:outline-offset-2 focus:outline-primary ${invalid ? 'outline-2 outline-danger' : ''}`}
      {...props}
    />
  )
}
