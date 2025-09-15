import { useState, useEffect } from 'react'
import { Textarea } from '@/components/ui/textarea'
// import { useDebounce } from '@/hooks/use-debounce' // Using inline version below

interface CaseDetailsProps {
  description: string
  instructions: string
  onDescriptionChange: (description: string) => void
  onInstructionsChange: (instructions: string) => void
  mode: 'create' | 'view'
}

export function CaseDetails({
  description,
  instructions,
  onDescriptionChange,
  onInstructionsChange,
  mode
}: CaseDetailsProps) {
  const [localDescription, setLocalDescription] = useState(description)
  const [localInstructions, setLocalInstructions] = useState(instructions)
  
  const debouncedDescription = useDebounce(localDescription, 1000)
  const debouncedInstructions = useDebounce(localInstructions, 1000)

  // Update local state when props change
  useEffect(() => {
    setLocalDescription(description)
  }, [description])

  useEffect(() => {
    setLocalInstructions(instructions)
  }, [instructions])

  // Auto-save in view mode when debounced values change
  useEffect(() => {
    if (mode === 'view' && debouncedDescription !== description) {
      onDescriptionChange(debouncedDescription)
    }
  }, [debouncedDescription, mode, description, onDescriptionChange])

  useEffect(() => {
    if (mode === 'view' && debouncedInstructions !== instructions) {
      onInstructionsChange(debouncedInstructions)
    }
  }, [debouncedInstructions, mode, instructions, onInstructionsChange])

  // Manual save on blur for create mode
  function handleDescriptionBlur() {
    if (mode === 'create' && localDescription !== description) {
      onDescriptionChange(localDescription)
    }
  }

  function handleInstructionsBlur() {
    if (mode === 'create' && localInstructions !== instructions) {
      onInstructionsChange(localInstructions)
    }
  }

  return (
    <div className="space-y-6">
      {/* Description */}
      <div>
        <label htmlFor="case-description" className="mb-2 block text-sm font-medium text-slate-300">
          Case Description
        </label>
        <Textarea
          id="case-description"
          value={localDescription}
          onChange={(e) => setLocalDescription(e.target.value)}
          onBlur={handleDescriptionBlur}
          placeholder="Describe what this case is about, key facts, and relevant background information..."
className="min-h-[120px] bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 resize-none"
          maxLength={5000}
        />
        <p className="mt-1 text-xs text-slate-500">
          {localDescription.length}/5000 characters
        </p>
      </div>

      {/* Instructions */}
      <div>
        <label htmlFor="case-instructions" className="mb-2 block text-sm font-medium text-slate-300">
          Legal Instructions & Notes
        </label>
        <Textarea
          id="case-instructions"
          value={localInstructions}
          onChange={(e) => setLocalInstructions(e.target.value)}
          onBlur={handleInstructionsBlur}
          placeholder="Add specific legal instructions, strategy notes, deadlines, or other important case management details..."
className="min-h-[120px] bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 resize-none"
          maxLength={10000}
        />
        <p className="mt-1 text-xs text-slate-500">
          {localInstructions.length}/10000 characters
        </p>
      </div>

      {mode === 'view' && (
        <p className="text-xs text-slate-400">
          ✨ Changes are automatically saved as you type
        </p>
      )}
    </div>
  )
}

// Simple debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}