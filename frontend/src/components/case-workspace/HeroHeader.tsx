import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface HeroHeaderProps {
  title: string
  description: string
  onChange: (patch: { title?: string; description?: string }) => void
  mode: 'create' | 'view'
}

export function HeroHeader({ title, description, onChange, mode }: HeroHeaderProps) {
  const editable = true // allow inline editing in both modes; in view mode we commit immediately via caller

  return (
    <div className="min-w-0">
      {/* Big title input */}
      <Input
        value={title}
        onChange={(e) => onChange({ title: e.target.value })}
        placeholder={mode === 'create' ? 'New Workspace' : 'Untitled Workspace'}
className={cn(
          'h-auto w-full border-none bg-transparent p-0 text-5xl md:text-6xl font-semibold leading-tight tracking-tight text-slate-800',
          'placeholder:text-slate-400 focus-visible:ring-0 focus-visible:ring-offset-0'
        )}
      />
      {/* One-line description input below */}
      <Input
        value={description}
        onChange={(e) => onChange({ description: e.target.value })}
        placeholder="Description of what this workspace is for and how to use it"
        className={cn(
'mt-2 h-auto w-full border-none bg-transparent p-0 text-base text-slate-800',
          'placeholder:text-slate-400 focus-visible:ring-0 focus-visible:ring-offset-0'
        )}
      />
    </div>
  )
}
