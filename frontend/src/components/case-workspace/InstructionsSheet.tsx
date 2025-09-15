import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { useState } from 'react'

interface InstructionsSheetProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  defaultValue?: string
  onSave?: (value: string) => void
}

export function InstructionsSheet({ open, onOpenChange, defaultValue = '', onSave }: InstructionsSheetProps) {
  const [value, setValue] = useState(defaultValue)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[520px] bg-white border-slate-200">
        <SheetHeader>
          <SheetTitle className="text-slate-900">Add legal instructions</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="What should collaborators keep in mind?"
            rows={12}
            className="bg-white border-slate-300 text-slate-900"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              className="bg-teal-700 text-white hover:bg-teal-600"
              onClick={() => {
                onSave?.(value)
                onOpenChange(false)
              }}
            >
              Save
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
