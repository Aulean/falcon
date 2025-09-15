import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { cn } from '@/lib/utils'

// Minimal inline-edit chip set: jurisdiction, practiceArea, status (Open/Discovery/Trial/Closed)
// You can extend this list easily by adding entries to CHIP_FIELDS.

type ChipField = {
  key: string
  label: string
  type?: 'text' | 'select'
  options?: string[]
}

const CHIP_FIELDS: ChipField[] = [
  { key: 'jurisdiction', label: 'Jurisdiction', type: 'text' },
  { key: 'practiceArea', label: 'Practice', type: 'text' },
  { key: 'status', label: 'Status', type: 'select', options: ['Open', 'Discovery', 'Trial', 'Closed'] },
  { key: 'caseNumber', label: 'Workspace #', type: 'text' },
]

export function InfoChips({
  values,
  onUpdate,
}: {
  values: Record<string, any>
  onUpdate: (field: string, value: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {CHIP_FIELDS.map((f) => (
        <EditableChip
          key={f.key}
          field={f}
          value={String(values?.[f.key] ?? '')}
          onChange={(v) => onUpdate(f.key, v)}
        />
      ))}
    </div>
  )
}

function EditableChip({
  field,
  value,
  onChange,
}: {
  field: ChipField
  value: string
  onChange: (v: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [local, setLocal] = useState(value)

  function commit() {
    onChange(local.trim())
    setEditing(false)
  }

  const isSelect = field.type === 'select'

  return (
    <div
      className={cn(
        'group inline-flex items-center gap-2 rounded-full border border-slate-300/80 bg-transparent px-3 py-1.5 text-sm text-slate-700',
        'hover:bg-slate-50'
      )}
      aria-label={field.label}
    >
      <span className="text-slate-500">{field.label}:</span>
      {/* Select type shows dropdown immediately */}
      {isSelect ? (
        <Select value={value} onValueChange={(v) => onChange(v)}>
          <SelectTrigger className="h-7 w-[150px] border-none bg-transparent p-0 text-slate-800 focus:ring-0 focus:ring-offset-0">
            <SelectValue placeholder="Set" />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((opt) => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : !editing ? (
        <button
          type="button"
          className={cn('text-slate-800', value ? '' : 'text-slate-400')}
          onClick={() => { setLocal(value); setEditing(true) }}
        >
          {value || 'Add'}
        </button>
      ) : (
        <Input
          autoFocus
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') { setLocal(value); setEditing(false) }
          }}
          className="h-7 w-[160px] border-none bg-transparent p-0 text-slate-800 focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      )}
    </div>
  )
}
