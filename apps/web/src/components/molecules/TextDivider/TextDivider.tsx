export type TextDividerProps = {
  children: string
}

export function TextDivider({ children }: TextDividerProps) {
  return (
    <div className="flex items-center gap-4">
      <hr className="flex-1 border-offwhite" />
      <span className="text-paragraph-sm text-offwhite">{children}</span>
      <hr className="flex-1 border-offwhite" />
    </div>
  )
}
