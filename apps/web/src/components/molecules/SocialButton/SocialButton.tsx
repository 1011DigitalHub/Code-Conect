export type SocialButtonProps = {
  name: string
  icon: string
  onClick?: () => void
  disabled?: boolean
}

export function SocialButton({ name, icon, onClick, disabled = false }: SocialButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex cursor-pointer flex-col items-center gap-1 rounded-md p-1 text-label text-offwhite transition hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:opacity-40"
    >
      <img src={icon} alt="" width={32} height={32} className="size-8" />
      {name}
    </button>
  )
}
