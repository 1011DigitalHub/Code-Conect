import type { InputHTMLAttributes } from 'react'

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & {
  invalid?: boolean
}

export function Input({ invalid = false, ...props }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={`w-full rounded-md bg-input px-4 py-2.5 text-ink placeholder:text-ink/70 focus:outline-2 focus:outline-offset-2 focus:outline-primary ${invalid ? 'outline-2 outline-red-400' : ''}`}
      {...props}
    />
  )
}
