import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'

const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL ?? 'http://localhost:3000'

export const Route = createFileRoute('/cases/new')({
  component: NewCasePage,
})

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

const schema = z.object({
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

type FormState = z.infer<typeof schema>

function NewCasePage() {
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const defaultValues: FormState = useMemo(
    () => ({
      title: '',
      client: '',
      opposingParty: '',
      jurisdiction: 'MT - Malta',
      practiceArea: 'Civil',
      status: 'Open',
      court: undefined,
      caseNumber: '',
      openedAt: new Date().toISOString().slice(0, 10),
      nextHearingAt: '',
      tags: '',
      description: '',
    }),
    []
  )

  const [form, setForm] = useState<FormState>(defaultValues)

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    setErrors({})
    const parsed = schema.safeParse(form)
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.') || 'form'
        fieldErrors[path] = issue.message
      }
      setErrors(fieldErrors)
      setSubmitting(false)
      return
    }

    const payload = {
      ...parsed.data,
      tags: parsed.data.tags
        ? parsed.data.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/cases?mock=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        throw new Error(`Failed to create case (${res.status})`)
      }
      const data = await res.json().catch(() => null)
      const newId = data?.id ?? data?.case?.id ?? data?.data?.id
      if (newId) {
        navigate({ to: '/cases/$caseId', params: { caseId: String(newId) } })
      } else {
        navigate({ to: '/' })
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
      setErrors((prev) => ({ ...prev, form: 'Could not create case. Please try again.' }))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">New Case</h1>
          <p className="text-sm text-muted-foreground">Create a case tailored for Maltese practice.</p>
        </div>
        <Link to="/" preload={false}>
          <Button variant="outline">Back to Cases</Button>
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Case details</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g., Smith v. Acme Corp." />
              {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="client">Client</Label>
              <Input id="client" value={form.client} onChange={(e) => set('client', e.target.value)} placeholder="e.g., Jane Smith" />
              {errors.client && <p className="text-xs text-destructive">{errors.client}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="opposingParty">Opposing party</Label>
              <Input id="opposingParty" value={form.opposingParty ?? ''} onChange={(e) => set('opposingParty', e.target.value)} placeholder="e.g., Acme Corp." />
            </div>

            <div className="space-y-2">
              <Label>Jurisdiction</Label>
              <Input value={form.jurisdiction} onChange={(e) => set('jurisdiction', e.target.value)} placeholder="MT - Malta" />
            </div>

            <div className="space-y-2">
              <Label>Practice area</Label>
              <Select value={form.practiceArea} onValueChange={(v) => set('practiceArea', v as PracticeArea)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {practiceAreas.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set('status', v as CaseStatus)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Open">Open</SelectItem>
                  <SelectItem value="Discovery">Discovery</SelectItem>
                  <SelectItem value="Trial">Trial</SelectItem>
                  <SelectItem value="Closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Court (Malta)</Label>
              <Select value={form.court ?? ''} onValueChange={(v) => set('court', v as MalteseCourt)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a court" />
                </SelectTrigger>
                <SelectContent>
                  {malteseCourts.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="caseNumber">Case number / reference</Label>
              <Input id="caseNumber" value={form.caseNumber ?? ''} onChange={(e) => set('caseNumber', e.target.value)} placeholder="e.g., 123/2025" />
              <p className="text-xs text-muted-foreground">Use your firm’s reference or court number (e.g., 123/2025).</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="openedAt">Opened on</Label>
              <Input id="openedAt" type="date" value={form.openedAt ?? ''} onChange={(e) => set('openedAt', e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nextHearingAt">Next hearing</Label>
              <Input id="nextHearingAt" type="datetime-local" value={form.nextHearingAt ?? ''} onChange={(e) => set('nextHearingAt', e.target.value)} />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="tags">Tags</Label>
              <Input id="tags" value={form.tags ?? ''} onChange={(e) => set('tags', e.target.value)} placeholder="Comma-separated e.g., Urgent, Fraud" />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="description">Notes / Description</Label>
              <Textarea id="description" value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} placeholder="Brief overview, strategy, or key facts." rows={5} />
            </div>
          </div>
        </div>

        <Separator />

        {errors.form && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {errors.form}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <Link to="/" preload={false}>
            <Button type="button" variant="outline">Cancel</Button>
          </Link>
          <Button type="submit" className="bg-teal-700 text-white hover:bg-teal-600" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create case'}
          </Button>
        </div>
      </form>
    </div>
  )
}

