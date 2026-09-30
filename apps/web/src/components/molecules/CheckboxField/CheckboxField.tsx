import { Checkbox, type CheckboxProps } from '../../atoms/Checkbox'

export type CheckboxFieldProps = Omit<CheckboxProps, 'id'> & {
  id: string
  label: string
}

export function CheckboxField({ id, label, ...checkboxProps }: CheckboxFieldProps) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} {...checkboxProps} />
      <label htmlFor={id} className="cursor-pointer text-sm text-muted">
        {label}
      </label>
    </div>
  )
}
