import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ExternalLink, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import type { LegalReference } from '@/lib/case-workspace-types'
import { LegalReferenceSchema } from '@/lib/case-workspace-types'
import { getCaseReferences, addCaseReference, deleteCaseReference } from '@/lib/case-workspace-api'

interface LegalReferencesProps {
  caseId: string
  show: boolean
  onClose: () => void
}

export function LegalReferences({ caseId, show }: LegalReferencesProps) {
  const [references, setReferences] = useState<LegalReference[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newReference, setNewReference] = useState({
    url: '',
    title: '',
    description: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (show && caseId) {
      loadReferences()
    }
  }, [show, caseId])

  async function loadReferences() {
    try {
      setIsLoading(true)
      const data = await getCaseReferences(caseId)
      setReferences(data)
    } catch (err) {
      toast.error('Failed to load references')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleAddReference() {
    try {
      setIsSubmitting(true)
      const result = LegalReferenceSchema.omit({ id: true }).safeParse(newReference)
      
      if (!result.success) {
        toast.error(result.error.issues[0]?.message || 'Invalid reference data')
        return
      }

      const added = await addCaseReference(caseId, result.data)
      setReferences(prev => [...prev, added])
      setNewReference({ url: '', title: '', description: '' })
      setShowAddForm(false)
      toast.success('Reference added')
    } catch (err) {
      toast.error('Failed to add reference')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDeleteReference(referenceId: string) {
    try {
      await deleteCaseReference(caseId, referenceId)
      setReferences(prev => prev.filter(ref => ref.id !== referenceId))
      toast.success('Reference removed')
    } catch (err) {
      toast.error('Failed to remove reference')
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-medium text-slate-900">Legal References</h3>
        <Button
          onClick={() => setShowAddForm(true)}
          size="sm"
          className="bg-red-600 text-white hover:bg-red-500"
        >
          <Plus className="mr-2 size-4" />
          Add Reference
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 rounded-lg bg-slate-800 animate-pulse" />
          ))}
        </div>
      ) : references.length === 0 ? (
        <div className="text-center text-slate-500 py-6">
          <p>No legal references yet. Add one to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {references.map((ref) => (
            <div key={ref.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h4 className="font-medium text-slate-900 truncate">{ref.title}</h4>
                  <a 
                    href={ref.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="mt-1 text-sm text-red-600 hover:text-red-500 inline-flex items-center gap-1"
                  >
                    <ExternalLink className="size-3" />
                    {ref.url}
                  </a>
                  {ref.description && (
                    <p className="mt-2 text-sm text-slate-700">{ref.description}</p>
                  )}
                </div>
                <Button
                  onClick={() => ref.id && handleDeleteReference(ref.id)}
                  variant="ghost"
                  size="sm"
                  className="text-slate-500 hover:text-red-600"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Reference Form */}
      <Sheet open={showAddForm} onOpenChange={setShowAddForm}>
          <SheetContent className="w-[480px] bg-white border-slate-200">
          <SheetHeader>
            <SheetTitle className="text-slate-900">Add Legal Reference</SheetTitle>
          </SheetHeader>
          
          <div className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                URL *
              </label>
              <Input
                value={newReference.url}
                onChange={(e) => setNewReference(prev => ({ ...prev, url: e.target.value }))}
                placeholder="https://..."
                className="bg-white border-slate-300 text-slate-900"
              />
            </div>
            
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Title *
              </label>
              <Input
                value={newReference.title}
                onChange={(e) => setNewReference(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Reference title"
                className="bg-white border-slate-300 text-slate-900"
              />
            </div>
            
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Description
              </label>
              <Textarea
                value={newReference.description}
                onChange={(e) => setNewReference(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of this reference"
                className="bg-white border-slate-300 text-slate-900 resize-none"
                rows={3}
              />
            </div>
            
            <div className="flex gap-3 pt-4">
              <Button
                onClick={handleAddReference}
                disabled={isSubmitting || !newReference.url || !newReference.title}
                className="bg-teal-700 text-white hover:bg-teal-600"
              >
                {isSubmitting ? 'Adding...' : 'Add Reference'}
              </Button>
              <Button
                onClick={() => setShowAddForm(false)}
                variant="outline"
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}