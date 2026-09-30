import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonVariant = 'primary'

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-ink hover:brightness-95 focus-visible:outline-primary',
}

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & {
  variant?: ButtonVariant
  fullWidth?: boolean
  icon?: ReactNode
}

export function Button({
  variant = 'primary',
  fullWidth = false,
  icon,
  type = 'button',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-md px-6 py-3 text-lg font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${variantClasses[variant]} ${fullWidth ? 'w-full' : ''}`}
      {...props}
    >
      {children}
      {icon}
    </button>
  )
}
