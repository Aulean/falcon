import { 
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputSubmit,
} from '@/components/ai-elements/prompt-input'

import { Button } from '@/components/ui/button'
import { Paperclip, Globe, Clock, Mic, Waves } from 'lucide-react'

interface CaseChatProps {
  caseId: string
  showActionRow?: boolean
  onAddFiles?: () => void
  onAddLinks?: () => void
  onAddInstructions?: () => void
}

export function CaseChat({ caseId, showActionRow, onAddFiles, onAddLinks, onAddInstructions }: CaseChatProps) {
  return (
    <div>
      {/* Action row like the reference screenshot */}
      {showActionRow && (
        <div className="mb-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" className="h-8 rounded-full bg-white text-slate-700 hover:bg-white/80" onClick={onAddFiles}>
              <Paperclip className="mr-2 size-4" /> Add files
            </Button>
            <Button size="sm" variant="secondary" className="h-8 rounded-full bg-white text-slate-700 hover:bg-white/80" onClick={onAddLinks}>
              <Globe className="mr-2 size-4" /> Add links
            </Button>
            <Button size="sm" variant="secondary" className="h-8 rounded-full bg-white text-slate-700 hover:bg-white/80" onClick={onAddInstructions}>
              <Waves className="mr-2 size-4" /> Add instructions
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-2">
        <PromptInput
          onSubmit={async ({ text }, e) => {
            if (!text?.trim()) return
            // For now, no backend wiring here; this mirrors home UX structure
            e.currentTarget.reset()
          }}
        >
          <PromptInputBody>
            <PromptInputTextarea placeholder="Ask anything about this workspace or @ mention a resource" />
            <PromptInputToolbar>
              <div className="ml-auto">
                <PromptInputSubmit className="bg-teal-700 text-white hover:bg-teal-600" />
              </div>
            </PromptInputToolbar>
          </PromptInputBody>
        </PromptInput>
      </div>
    </div>
  )
}