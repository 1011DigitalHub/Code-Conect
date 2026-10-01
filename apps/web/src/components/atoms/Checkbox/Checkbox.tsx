import type { InputHTMLAttributes } from 'react'

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'type'>

export function Checkbox(props: CheckboxProps) {
  return (
    <span className="relative inline-flex size-7 shrink-0">
      <input
        type="checkbox"
        className="peer size-7 cursor-pointer appearance-none rounded border-2 border-input bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        {...props}
      />
      <img
        src="/icons/check.svg"
        alt=""
        className="pointer-events-none absolute inset-0 m-auto hidden size-4 peer-checked:block"
      />
    </span>
  )
}
