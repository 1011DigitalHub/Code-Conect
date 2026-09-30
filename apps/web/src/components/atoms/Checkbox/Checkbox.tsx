import type { InputHTMLAttributes } from 'react'

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'type'>

export function Checkbox(props: CheckboxProps) {
  return (
    <span className="relative inline-flex size-5 shrink-0">
      <input
        type="checkbox"
        className="peer size-5 cursor-pointer appearance-none rounded border border-muted bg-transparent checked:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        {...props}
      />
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="pointer-events-none absolute inset-0 m-auto hidden size-3.5 text-primary peer-checked:block"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 8.5 6.5 12 13 4.5" />
      </svg>
    </span>
  )
}
