import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Upload, FileText, Trash2, CalendarClock, Gavel, Hash, Users as UsersIcon } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL ?? 'http://localhost:3000'

// Shared domain bits with New Case form
const malteseCourts = [
  'Civil Court (First Hall)',
  'Civil Court (Family Section)',
  'Court of Appeal',
  'Criminal Court',
  'Court of Criminal Appeal',
  'Magistrates’ Court',
  'Industrial Tribunal',
  'Administrative Review Tribunal',
  'Commercial Section',
] as const

type MalteseCourt = (typeof malteseCourts)[number]

type CaseStatus = 'Open' | 'Discovery' | 'Trial' | 'Closed'

const practiceAreas = [
  'Civil',
  'Criminal',
  'Commercial',
  'Company Law',
  'Employment',
  'Family',
  'Property',
  'Administrative',
  'Constitutional',
  'Maritime',
  'Financial Services / AML',
  'Tax',
  'IP / IT',
] as const

type PracticeArea = (typeof practiceAreas)[number]

const detailsSchema = z.object({
  title: z.string().min(3, 'Title is required'),
  client: z.string().min(2, 'Client is required'),
  opposingParty: z.string().optional(),
  jurisdiction: z.string().default('MT - Malta'),
  practiceArea: z.enum(practiceAreas),
  status: z.enum(['Open', 'Discovery', 'Trial', 'Closed']).default('Open'),
  court: z.enum(malteseCourts).optional(),
  caseNumber: z.string().optional(),
  openedAt: z.string().optional(), // YYYY-MM-DD
  nextHearingAt: z.string().optional(), // YYYY-MM-DDTHH:mm
  tags: z.string().optional(), // comma-separated
  description: z.string().optional(),
})

type DetailsForm = z.infer<typeof detailsSchema>

type Assignee = { id: string; name: string; avatarUrl?: string }

export const Route = createFileRoute('/cases/$caseId')({
  component: CaseDetailsPage,
})

type UploadItem = {
  tempId: string
  name: string
  size: number
  progress: number // 0-100
  status: 'pending' | 'uploading' | 'done' | 'error'
  serverId?: string
}

function CaseDetailsPage() {
  const { caseId } = Route.useParams()
  const [title, setTitle] = useState<string>('')
  const [docs, setDocs] = useState<Array<{ id: string; name: string; size: number }>>([])
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [editKey, setEditKey] = useState<keyof DetailsForm | null>(null)
  const [assignees, setAssignees] = useState<Assignee[]>([])

  // Case details form state
  const [form, setForm] = useState<DetailsForm>({
    title: '',
    client: '',
    opposingParty: '',
    jurisdiction: 'MT - Malta',
    practiceArea: 'Civil',
    status: 'Open',
    court: undefined,
    caseNumber: '',
    openedAt: '',
    nextHearingAt: '',
    tags: '',
    description: '',
  })
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  function setField<K extends keyof DetailsForm>(key: K, value: DetailsForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // In a real app, fetch case info + document list
  useEffect(() => {
    let ignore = false
    ;(async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/cases/${caseId}?mock=1`)
        if (res.ok) {
          const data = await res.json().catch(() => null)
          if (!ignore && data) {
            setTitle(data?.title ?? '')
            // Prefill form if data has fields
            setForm((prev) => ({
              ...prev,
              title: String(data?.title ?? prev.title ?? ''),
              client: String(data?.client ?? prev.client ?? ''),
              opposingParty: data?.opposingParty ? String(data.opposingParty) : '',
              jurisdiction: String(data?.jurisdiction ?? prev.jurisdiction ?? 'MT - Malta'),
              practiceArea: (practiceAreas.includes(data?.practiceArea) ? data.practiceArea : prev.practiceArea) as PracticeArea,
              status: (['Open','Discovery','Trial','Closed'] as const).includes(data?.status) ? data.status : prev.status,
              court: malteseCourts.includes(data?.court) ? (data.court as MalteseCourt) : undefined,
              caseNumber: data?.caseNumber ? String(data.caseNumber) : '',
              openedAt: data?.openedAt ? String(data.openedAt).slice(0, 10) : prev.openedAt,
              nextHearingAt: data?.nextHearingAt ? String(data.nextHearingAt).slice(0, 16) : prev.nextHearingAt,
              tags: Array.isArray(data?.tags) ? data.tags.join(', ') : (typeof data?.tags === 'string' ? data.tags : ''),
              description: data?.description ? String(data.description) : '',
            }))
            // People/assignees
            if (Array.isArray(data?.assignees)) {
              setAssignees(
                data.assignees.map((p: any, i: number) => ({ id: String(p.id ?? i), name: String(p.name ?? p), avatarUrl: p.avatarUrl }))
              )
            } else if (Array.isArray(data?.participants)) {
              setAssignees(
                data.participants.map((p: any, i: number) => ({ id: String(p.id ?? i), name: String(p.name ?? p), avatarUrl: p.avatarUrl }))
              )
            }
            // If API returns docs, set them here
            if (Array.isArray(data?.documents)) {
              setDocs(
                data.documents.map((d: any) => ({
                  id: String(d.id ?? d.key ?? d.name),
                  name: String(d.name ?? d.key ?? 'document'),
                  size: Number(d.size ?? 0),
                })),
              )
            }
          }
        }
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      ignore = true
    }
  }, [caseId])

  const totalSize = useMemo(() => docs.reduce((a, d) => a + d.size, 0), [docs])

  // Global drag & drop listeners for the whole page
  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types?.includes('Files')

    const onDragOver = (e: DragEvent) => {
      if (hasFiles(e)) {
        e.preventDefault()
        setIsDragging(true)
      }
    }
    const onDragEnter = (e: DragEvent) => {
      if (hasFiles(e)) setIsDragging(true)
    }
    const onDragLeave = () => setIsDragging(false)
    const onDrop = (e: DragEvent) => {
      if (hasFiles(e)) {
        e.preventDefault()
        setIsDragging(false)
        enqueueUploads(e.dataTransfer?.files || null)
        const count = e.dataTransfer?.files?.length || 0
        if (count > 0) toast.info(`Uploading ${count} file${count > 1 ? 's' : ''}…`)
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
  }, [])

  function onSelectFiles() {
    inputRef.current?.click()
  }

  function enqueueUploads(fileList: FileList | File[] | null) {
    if (!fileList) return
    const files = Array.from(fileList as any as File[])
    const newItems: UploadItem[] = files.map((f) => ({
      tempId: `${f.name}-${f.size}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: f.name,
      size: f.size,
      progress: 0,
      status: 'pending',
    }))
    setUploads((prev) => [...newItems, ...prev])
    // Start uploading sequentially to keep it simple (could also do parallel)
    newItems.forEach((item, idx) => uploadSingle(files[idx], item.tempId))
    if (inputRef.current) inputRef.current.value = ''
  }

  function uploadSingle(file: File, tempId: string) {
    setUploads((prev) => prev.map((u) => (u.tempId === tempId ? { ...u, status: 'uploading', progress: 0 } : u)))
    const form = new FormData()
    // Use 'files' field name for compatibility with existing API
    form.append('files', file)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${BACKEND_URL}/api/cases/${caseId}/documents?mock=1`)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100)
        setUploads((prev) => prev.map((u) => (u.tempId === tempId ? { ...u, progress: pct } : u)))
      }
    }

    xhr.onerror = () => {
      console.error('Upload failed')
      toast.error(`Failed to upload ${file.name}`)
      setUploads((prev) => prev.map((u) => (u.tempId === tempId ? { ...u, status: 'error' } : u)))
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        let data: any = null
        try {
          data = JSON.parse(xhr.responseText)
        } catch {}
        const doc = Array.isArray(data) ? data[0] : data
        const serverId = doc?.id ?? doc?.key ?? undefined
        const size = doc?.size ?? file.size
        const name = doc?.name ?? file.name
        setUploads((prev) => prev.map((u) => (u.tempId === tempId ? { ...u, status: 'done', progress: 100, serverId } : u)))
        setDocs((prev) => prev.concat({ id: String(serverId ?? tempId), name, size }))
        toast.success(`Uploaded ${name}`)
      } else {
        console.error(`Upload failed (${xhr.status})`)
        toast.error(`Failed to upload ${file.name} (${xhr.status})`)
        setUploads((prev) => prev.map((u) => (u.tempId === tempId ? { ...u, status: 'error' } : u)))
      }
    }

    xhr.send(form)
  }

  async function saveField<K extends keyof DetailsForm>(key: K, value: DetailsForm[K]) {
    // validate just this field using the schema
    const partial: any = { [key]: value }
    // For tags, convert string to array in payload
    const payload: any = key === 'tags' && typeof value === 'string'
      ? { tags: value.split(',').map((t) => t.trim()).filter(Boolean) }
      : partial

    try {
      const res = await fetch(`${BACKEND_URL}/api/cases/${caseId}?mock=1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`Failed to save (${res.status})`)
      setField(key, value)
      if (key === 'title' && typeof value === 'string') setTitle(value || title)
      toast.success('Saved')
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
      toast.error('Failed to save')
    }
  }

  function removeDoc(id: string) {
    setDocs((prev) => prev.filter((d) => d.id !== id))
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight truncate">{form.title || title || 'Untitled'}</h1>
          <p className="text-sm text-muted-foreground">Manage documents and details.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {/* Status - change directly from chip */}
            <Select value={form.status} onValueChange={(v) => saveField('status', v as any)}>
            <SelectTrigger className="h-9 rounded-full border px-3 text-sm text-muted-foreground hover:bg-accent w-auto">
                <SelectValue placeholder="Set status" />
              </SelectTrigger>
              <SelectContent>
                {(['Open','Discovery','Trial','Closed'] as const).map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Case number */}
            <button type="button" className="h-9 rounded-full border px-3 text-sm text-muted-foreground hover:bg-accent" onClick={() => setEditKey('caseNumber')}>
              <span className="inline-flex items-center gap-1">
                <Hash className="size-4" /> {form.caseNumber?.trim() || 'Add number'}
              </span>
            </button>
            {/* Court */}
            <button type="button" className="h-9 rounded-full border px-3 text-sm text-muted-foreground hover:bg-accent" onClick={() => setEditKey('court')}>
              <span className="inline-flex items-center gap-1">
                <Gavel className="size-4" /> {form.court || 'Select court'}
              </span>
            </button>
            {/* Opened on (instead of next hearing) */}
            <button type="button" className="h-9 rounded-full border px-3 text-sm text-muted-foreground hover:bg-accent" onClick={() => setEditKey('openedAt')}>
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="size-4" /> {form.openedAt ? new Date(form.openedAt).toLocaleDateString() : 'Opened on'}
              </span>
            </button>
            {/* Practice area */}
            <Select value={form.practiceArea} onValueChange={(v) => saveField('practiceArea', v as any)}>
            <SelectTrigger className="h-9 rounded-full border px-3 text-sm text-muted-foreground hover:bg-accent w-auto">
                <SelectValue placeholder="Practice area" />
              </SelectTrigger>
              <SelectContent>
                {practiceAreas.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* People assigned */}
            {assignees.length > 0 && (
              <div className="ml-2 inline-flex items-center gap-1">
                <UsersIcon className="size-4 text-muted-foreground" />
                <div className="-space-x-2 flex">
                  {assignees.slice(0, 4).map((p) => (
                    <Avatar key={p.id} className="size-6 border">
                      {p.avatarUrl ? (
                        <AvatarImage src={p.avatarUrl} alt={p.name} />
                      ) : (
                        <AvatarFallback>{initials(p.name)}</AvatarFallback>
                      )}
                    </Avatar>
                  ))}
                  {assignees.length > 4 && (
                    <div className="size-6 rounded-full border bg-background text-[10px] grid place-items-center text-muted-foreground">
                      +{assignees.length - 4}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/cases" preload={false}>
            <Button variant="outline">Back to Cases</Button>
          </Link>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => enqueueUploads(e.currentTarget.files)}
          />
          <Button onClick={onSelectFiles} className="bg-teal-700 text-white hover:bg-teal-600">
            <Upload className="mr-2 size-4" /> Upload documents
          </Button>
        </div>
      </div>

      {/* Overview: condensed, per-field editing */}
      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Overview</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">General</div>
            <ul className="divide-y">
              <InlineField compact label="Title" field="title" value={form.title} type="text" onSave={saveField} forceEditKey={editKey} onEndEdit={() => setEditKey(null)} />
              <InlineField compact label="Status" field="status" value={form.status} type="select" options={["Open","Discovery","Trial","Closed"]} onSave={saveField} forceEditKey={editKey} onEndEdit={() => setEditKey(null)} />
              <InlineField compact label="Case number" field="caseNumber" value={form.caseNumber ?? ''} type="text" onSave={saveField} forceEditKey={editKey} onEndEdit={() => setEditKey(null)} />
            </ul>
          </div>
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Parties</div>
            <ul className="divide-y">
              <InlineField compact label="Client" field="client" value={form.client} type="text" onSave={saveField} forceEditKey={editKey} onEndEdit={() => setEditKey(null)} />
              <InlineField compact label="Opposing party" field="opposingParty" value={form.opposingParty ?? ''} type="text" onSave={saveField} forceEditKey={editKey} onEndEdit={() => setEditKey(null)} />
            </ul>
          </div>
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Court & Schedule</div>
            <ul className="divide-y">
              <InlineField compact label="Court (Malta)" field="court" value={form.court ?? ''} type="select" options={malteseCourts as unknown as string[]} onSave={saveField} forceEditKey={editKey} onEndEdit={() => setEditKey(null)} />
              <InlineField compact label="Jurisdiction" field="jurisdiction" value={form.jurisdiction} type="text" onSave={saveField} forceEditKey={editKey} onEndEdit={() => setEditKey(null)} />
              <InlineField compact label="Practice area" field="practiceArea" value={form.practiceArea} type="select" options={practiceAreas as unknown as string[]} onSave={saveField} forceEditKey={editKey} onEndEdit={() => setEditKey(null)} />
              <InlineField compact label="Opened on" field="openedAt" value={form.openedAt ?? ''} type="date" onSave={saveField} forceEditKey={editKey} onEndEdit={() => setEditKey(null)} />
              <InlineField compact label="Next hearing" field="nextHearingAt" value={form.nextHearingAt ?? ''} type="datetime-local" onSave={saveField} forceEditKey={editKey} onEndEdit={() => setEditKey(null)} />
              <InlineField compact label="Tags" field="tags" value={form.tags ?? ''} type="text" hint="Comma-separated e.g., Urgent, Fraud" onSave={saveField} forceEditKey={editKey} onEndEdit={() => setEditKey(null)} />
            </ul>
          </div>
        </div>
        <div className="space-y-2">
          <ul className="divide-y">
            <InlineField compact label="Notes / Description" field="description" value={form.description ?? ''} type="textarea" onSave={saveField} forceEditKey={editKey} onEndEdit={() => setEditKey(null)} />
          </ul>
        </div>
        {errors.form && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {errors.form}
          </div>
        )}
      </div>

      {isDragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
          <div className="rounded-2xl border-2 border-dashed border-primary/40 bg-background/80 px-6 py-4 text-sm text-muted-foreground shadow-xl">
            Drop files anywhere to upload
          </div>
        </div>
      )}

      {uploads.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium">Uploads</div>
          <ul className="space-y-2">
            {uploads.map((u) => (
              <li key={u.tempId} className="rounded-md border p-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="min-w-0 truncate">{u.name}</div>
                  <div className="ml-3 shrink-0 text-xs text-muted-foreground">{formatBytes(u.size)}</div>
                </div>
                <div className="mt-2">
                  <Progress value={u.progress} />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {u.status === 'uploading' && 'Uploading…'}
                  {u.status === 'done' && 'Completed'}
                  {u.status === 'error' && 'Failed'}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Separator />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ScrollArea className="h-[calc(100vh-18rem)] rounded-md border">
            <div className="p-4">
              {docs.length === 0 ? (
                <div className="flex h-[40vh] items-center justify-center text-sm text-muted-foreground">
                  No documents yet. Use “Upload documents” to add files.
                </div>
              ) : (
                <ul className="divide-y">
                  {docs.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <FileText className="size-4 text-muted-foreground" />
                        <div className="min-w-0">
                          <div className="truncate text-sm">{d.name}</div>
                          <div className="text-xs text-muted-foreground">{formatBytes(d.size)}</div>
                        </div>
                      </div>
                      <Button variant="outline" size="icon" onClick={() => removeDoc(d.id)} aria-label={`Remove ${d.name}`}>
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="space-y-3">
          <div>
            <div className="text-sm font-medium">Summary</div>
            <div className="mt-1 text-xs text-muted-foreground">{docs.length} document(s), {formatBytes(totalSize)} total</div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary">Country law: Malta</Badge>
            <Badge variant="secondary">Office docs: Enabled</Badge>
            <Badge variant="secondary">Case docs: {docs.length}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Uploaded files will be processed for retrieval. On the backend, store to S3 using Bun’s native S3 client per your preference, and index for search.
          </p>
        </div>
      </div>
    </div>
  )
}

function formatBytes(n: number) {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(n) / Math.log(1024))
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] || ''
  const last = parts[1]?.[0] || ''
  return (first + last).toUpperCase() || 'U'
}

// Inline editable field component
function InlineField<K extends keyof DetailsForm>(props: {
  label: string
  field: K
  value: DetailsForm[K] | string
  type: 'text' | 'textarea' | 'select' | 'date' | 'datetime-local'
  options?: string[]
  hint?: string
  compact?: boolean
  forceEditKey?: keyof DetailsForm | null
  onEndEdit?: () => void
  onSave: (key: K, value: DetailsForm[K]) => Promise<void> | void
}) {
  const { label, field, value, type, options, hint, compact = false, forceEditKey, onEndEdit, onSave } = props
  const [editing, setEditing] = useState(false)
  const [local, setLocal] = useState<string>(String(value ?? ''))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setLocal(String(value ?? ''))
  }, [value])

  useEffect(() => {
    if (forceEditKey && forceEditKey === field) {
      setEditing(true)
    }
  }, [forceEditKey, field])

  async function handleCommit() {
    try {
      setSaving(true)
      await onSave(field, local as any)
      setEditing(false)
      onEndEdit?.()
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className={`flex items-start justify-between gap-4 ${compact ? 'py-2' : 'py-3'}`}>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        {!editing ? (
          <div className={`mt-1 ${compact ? 'text-sm' : 'text-sm'}`}>
            {String(value ?? '').trim() || <span className="text-muted-foreground">—</span>}
          </div>
        ) : (
          <div className="mt-1 max-w-lg">
            {type === 'select' ? (
              <Select value={local} onValueChange={(v) => setLocal(v)}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {options?.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : type === 'textarea' ? (
              <Textarea rows={4} value={local} onChange={(e) => setLocal(e.target.value)} />
            ) : (
              <Input type={type} value={local} onChange={(e) => setLocal(e.target.value)} className="h-8" />
            )}
            {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
          </div>
        )}
      </div>
      <div className="shrink-0 space-x-1">
        {!editing ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        ) : (
          <>
            <Button type="button" size="sm" className="bg-teal-700 text-white hover:bg-teal-600" onClick={handleCommit} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setEditing(false); onEndEdit?.() }} disabled={saving}>
              Cancel
            </Button>
          </>
        )}
      </div>
    </li>
  )
}

