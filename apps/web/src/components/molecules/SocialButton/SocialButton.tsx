export type SocialButtonProps = {
  name: string
  icon: string
  onClick?: () => void
}

export function SocialButton({ name, icon, onClick }: SocialButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex cursor-pointer flex-col items-center gap-1 rounded-md p-1 text-label text-offwhite transition hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <img src={icon} alt="" width={32} height={32} className="size-8" />
      {name}
    </button>
  )
}
