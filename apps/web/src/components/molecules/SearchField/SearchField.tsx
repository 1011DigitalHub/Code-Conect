import { useState } from 'react'
import { Button } from '../../atoms/Button'
import { Icon } from '../../atoms/Icon'
import { Input } from '../../atoms/Input'
import { Label } from '../../atoms/Label'

export type SearchFieldProps = {
  id: string
  label: string
  defaultValue?: string
  onSubmit: (q: string) => void
}

// Submit-driven rather than search-as-you-type: the filter runs as a
// full-text query on the server, so one request per intent beats one per
// keystroke, it needs no debounce, and it gives screen readers exactly one
// results announcement to make.
export function SearchField({ id, label, defaultValue = '', onSubmit }: SearchFieldProps) {
  const [value, setValue] = useState(defaultValue)

  return (
    <form
      role="search"
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit(value.trim())
      }}
    >
      <div className="flex flex-1 flex-col gap-2">
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          type="search"
          name="q"
          value={value}
          placeholder="Busque por tema, linguagem ou ferramenta"
          onChange={(event) => setValue(event.target.value)}
        />
      </div>
      <Button type="submit" icon={<Icon name="search" />}>
        Buscar
      </Button>
    </form>
  )
}
