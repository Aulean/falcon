import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { ArrowLeft, FileText, Link as LinkIcon, NotebookPen } from 'lucide-react'

import type { CaseWorkspaceFormValues } from '@/lib/case-workspace-types'
import { createCase, getCase, updateCase, presignDocumentUpload, uploadToPresignedUrl, registerUploadedDocument } from '@/lib/case-workspace-api'

import { CaseHeader } from './CaseHeader'
// import { CaseDetails } from './CaseDetails'
import { LegalReferences } from './LegalReferences'
import { DocumentsUpload } from './DocumentsUpload'
import { CaseChat } from './CaseChat'
import { MyThreads } from './MyThreads'
import { InstructionsSheet } from './InstructionsSheet'
import { HeroHeader } from './HeroHeader'
import { InfoChips } from './InfoChips'
import { LinkDialog } from './LinkDialog'

export interface CaseWorkspaceProps {
  mode: 'create' | 'view'
  caseId?: string
}

export function CaseWorkspace({ mode, caseId }: CaseWorkspaceProps) {
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(mode === 'view')
  const [isSaving, setIsSaving] = useState(false)
  const [autoCreated, setAutoCreated] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [caseData, setCaseData] = useState<CaseWorkspaceFormValues>({
    title: '',
    description: '',
    context: '',
    instructions: '',
    references: []
  })
  
  const [showAddReferences, setShowAddReferences] = useState(false)
  const [showLinkDialog, setShowLinkDialog] = useState(false)
  const [showAddDocuments, setShowAddDocuments] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)

  // Load case data for view mode
  useEffect(() => {
    if (mode === 'view' && caseId) {
      loadCaseData()
    }
  }, [mode, caseId])

  async function loadCaseData() {
    if (!caseId) return
    
    try {
      setIsLoading(true)
      const data = await getCase(caseId)
      setCaseData({
        title: data.title,
        description: data.description || '',
        context: (data as any).context || '',
        instructions: data.instructions || '',
        references: data.references || []
      })
    } catch (err) {
      toast.error('Failed to load workspace')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleCreateCase() {
    if (!caseData.title.trim()) {
      toast.error('Please enter a workspace title')
      return
    }

    try {
      setIsSaving(true)
      const updated = await updateCase(caseId!, caseData)
      toast.success('Saved')
      navigate({ to: '/workspace/$caseId', params: { caseId: updated.id || caseId! } })
    } catch (err) {
      toast.error('Failed to save')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleUpdateField(field: keyof CaseWorkspaceFormValues, value: any) {
    if (mode === 'create') {
      setCaseData(prev => ({ ...prev, [field]: value }))
      return
    }

    if (!caseId) return

    try {
      await updateCase(caseId, { [field]: value })
      setCaseData(prev => ({ ...prev, [field]: value }))
      toast.success('Saved')
    } catch (err) {
      toast.error('Failed to save')
    }
  }

  const isCreateMode = mode === 'create'
  const canUseAdvancedFeatures = !isCreateMode && caseId

  // No longer auto-create here; handled by /workspace/new route to avoid duplicate creations
  // (left intentionally empty)

  // File uploads: open file dialog and drag-drop support
  function openFileDialog() {
    fileInputRef.current?.click()
  }

  async function handleSelectedFiles(fileList: FileList | null) {
    if (!fileList || !caseId) return
    const files = Array.from(fileList)
    for (const file of files) {
      try {
        const presign = await presignDocumentUpload(caseId, file.name, file.size, file.type || 'application/octet-stream')
        await uploadToPresignedUrl(presign.uploadUrl, file, presign.fields)
        await registerUploadedDocument(caseId, {
          name: file.name,
          url: presign.fileUrl,
          size: file.size,
          contentType: file.type || 'application/octet-stream',
          uploadedAt: new Date().toISOString(),
        } as any)
        toast.success(`Uploaded ${file.name}`)
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err))
        toast.error(`Failed to upload ${file.name}`)
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types?.includes('Files')
    const onDragOver = (e: DragEvent) => { if (hasFiles(e)) { e.preventDefault(); setIsDragging(true) } }
    const onDragEnter = (e: DragEvent) => { if (hasFiles(e)) setIsDragging(true) }
    const onDragLeave = () => setIsDragging(false)
    const onDrop = (e: DragEvent) => {
      if (hasFiles(e)) {
        e.preventDefault();
        setIsDragging(false)
        const dt = e.dataTransfer
        if (dt?.files?.length) handleSelectedFiles(dt.files)
      }
    }
    document.addEventListener('dragover', onDragOver)
    document.addEventListener('dragenter', onDragEnter)
    document.addEventListener('dragleave', onDragLeave)
    document.addEventListener('drop', onDrop)
    return () => {
      document.removeEventListener('dragover', onDragOver)
      document.removeEventListener('dragenter', onDragEnter)
      document.removeEventListener('dragleave', onDragLeave)
      document.removeEventListener('drop', onDrop)
    }
  }, [caseId])

  // Allow updating arbitrary fields without changing schema (for chips)
  async function handleUpdateAny(field: string, value: any) {
    if (mode === 'create') {
      setCaseData((prev: any) => ({ ...prev, [field]: value }))
      return
    }
    if (!caseId) return
    try {
      await updateCase(caseId, { [field]: value } as any)
      setCaseData((prev: any) => ({ ...prev, [field]: value }))
    } catch (err) {
      toast.error('Failed to save')
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-3xl px-4 py-4 md:px-4">
          <div className="animate-pulse space-y-4">
            <div className="h-7 w-40 rounded bg-slate-200" />
            <div className="h-40 rounded-xl bg-slate-200" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-3xl px-4 py-4 md:px-4">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/workspaces" className="text-teal-700 hover:text-teal-600">
              <Button variant="ghost" size="sm" className="text-teal-700 hover:text-teal-600">
                <ArrowLeft className="mr-2 size-4" />
                Back to Workspaces
              </Button>
            </Link>
            <div className="text-sm text-slate-400">
              {isCreateMode ? 'New Workspace' : 'Workspace'}
            </div>
          </div>

        </div>

        {/* Hidden input for file uploads */}
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => handleSelectedFiles(e.currentTarget.files)} />

        {/* Big hero header like New Space */}
        <div className="mt-1">
          <HeroHeader
            title={caseData.title}
            description={caseData.description || ''}
            mode={mode}
            onChange={(patch) => {
              if (patch.title !== undefined) handleUpdateField('title', patch.title)
              if (patch.description !== undefined) handleUpdateField('description', patch.description)
            }}
          />
        </div>

        {/* Inline editable chips */}
        <div className="mt-2">
          <InfoChips
            values={caseData as any}
            onUpdate={handleUpdateAny}
          />
        </div>


        {/* Actions (optional): you can uncomment later if you want them above chat)
        <div className="mt-4 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
          <Button onClick={() => setShowAddDocuments(true)} disabled={!canUseAdvancedFeatures} variant="secondary" className="h-8 rounded-full bg-white text-slate-700 hover:bg-white/80">
            <FileText className="mr-2 size-4" /> Add files
          </Button>
          <Button onClick={() => setShowAddReferences(true)} disabled={!canUseAdvancedFeatures} variant="secondary" className="h-8 rounded-full bg-white text-slate-700 hover:bg-white/80">
            <LinkIcon className="mr-2 size-4" /> Add links
          </Button>
          <Button onClick={() => setShowInstructions(true)} disabled={isCreateMode} variant="secondary" className="h-8 rounded-full bg-white text-slate-700 hover:bg-white/80">
            <NotebookPen className="mr-2 size-4" /> Add instructions
          </Button>
        </div>
        */}

        {/* Sheets */}
        <InstructionsSheet
          open={showInstructions}
          onOpenChange={setShowInstructions}
          defaultValue={caseData.instructions}
          onSave={(val) => handleUpdateField('instructions', val)}
        />
        {/* Hide references and uploads block by default for a cleaner layout */}
        {false && (
          <>
            <LinkDialog caseId={caseId!} open={showLinkDialog} onOpenChange={setShowLinkDialog} onSelectLocalFiles={openFileDialog} />
            <LegalReferences caseId={caseId!} show={showAddReferences} onClose={() => setShowAddReferences(false)} />
            <DocumentsUpload caseId={caseId!} show={showAddDocuments} onClose={() => setShowAddDocuments(false)} />
          </>
        )}

        {/* Ask anything / Chat */}
        <div className="mt-4">
            <div className="mx-auto max-w-3xl">
              <CaseChat
                caseId={caseId}
                showActionRow
                onAddFiles={() => openFileDialog()}
                onAddLinks={() => setShowLinkDialog(true)}
                onAddInstructions={() => setShowInstructions(true)}
              />
            </div>
        </div>

        {/* My Threads at bottom */}
        <div className="mt-10">
          {canUseAdvancedFeatures ? (
            <MyThreads caseId={caseId!} />
          ) : (
            <div className="p-6">
              <h3 className="mb-4 text-lg font-medium text-slate-900">My threads</h3>
              <div className="text-center text-slate-500 py-8">
                <p className="text-sm">Your AI conversations will appear here once you create the workspace.</p>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}