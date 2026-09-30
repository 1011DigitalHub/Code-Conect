import type { LabelHTMLAttributes } from 'react'

export type LabelProps = Omit<LabelHTMLAttributes<HTMLLabelElement>, 'className'>

export function Label(props: LabelProps) {
  return <label className="text-lg text-offwhite" {...props} />
}
