import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Edit2, Check, X } from 'lucide-react'

interface CaseHeaderProps {
  title: string
  onTitleChange: (title: string) => void
  mode: 'create' | 'view'
}

export function CaseHeader({ title, onTitleChange, mode }: CaseHeaderProps) {
  const [isEditing, setIsEditing] = useState(mode === 'create')
  const [editValue, setEditValue] = useState(title)

  function handleEdit() {
    setEditValue(title)
    setIsEditing(true)
  }

  function handleSave() {
    onTitleChange(editValue.trim())
    setIsEditing(false)
  }

  function handleCancel() {
    setEditValue(title)
    setIsEditing(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      handleSave()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex items-center gap-4">
        {isEditing ? (
          <>
            <Input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={mode === 'create' ? 'Enter workspace title' : 'Workspace title'}
              className="text-2xl font-bold bg-white border-slate-300 text-slate-900 placeholder:text-slate-400"
              autoFocus
            />
            {mode === 'view' && (
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSave} className="bg-teal-700 hover:bg-teal-600">
                  <Check className="size-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={handleCancel}>
                  <X className="size-4" />
                </Button>
              </div>
            )}
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-slate-900">
              {title || 'Untitled Workspace'}
            </h1>
            {mode === 'view' && (
              <Button size="sm" variant="ghost" onClick={handleEdit} className="text-slate-400 hover:text-white">
                <Edit2 className="size-4" />
              </Button>
            )}
          </>
        )}
      </div>
      
      {mode === 'create' && (
        <p className="mt-2 text-sm text-slate-400">
          Give your workspace a clear, descriptive title
        </p>
      )}
    </div>
  )
}