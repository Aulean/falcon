import { createFileRoute, Link, Outlet, useRouterState } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  CalendarClock,
  FileText,
  Filter,
  MapPin,
  MessageSquare,
  Plus,
  Search,
  Upload,
  Users,
} from 'lucide-react'

import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputSubmit,
} from '@/components/ai-elements/prompt-input'

export const Route = createFileRoute('/cases')({
  component: CasesPage,
})

// --- Types & Mock Data ---

type CaseStatus = 'Open' | 'Discovery' | 'Trial' | 'Closed'

type Case = {
  id: string
  title: string
  client: string
  jurisdiction: string // Country / Region
  practiceArea: string // e.g., Employment, Corporate, Civil, Criminal
  status: CaseStatus
  tags: string[]
  updatedAt: string // ISO date
  nextHearing?: string // ISO date
  docCount: number
  participantsCount: number
}

const MOCK_CASES: Case[] = [
  {
    id: 'c-001',
    title: 'Smith v. Acme Corp.',
    client: 'Jane Smith',
    jurisdiction: 'US - California',
    practiceArea: 'Employment',
    status: 'Discovery',
    tags: ['Wrongful Termination', 'High Priority'],
    updatedAt: '2025-09-10T15:30:00Z',
    nextHearing: '2025-10-03T14:00:00Z',
    docCount: 42,
    participantsCount: 6,
  },
  {
    id: 'c-002',
    title: 'Regina v. Turner',
    client: 'Crown Prosecution',
    jurisdiction: 'UK - England & Wales',
    practiceArea: 'Criminal',
    status: 'Open',
    tags: ['Fraud'],
    updatedAt: '2025-09-06T09:15:00Z',
    nextHearing: '2025-09-28T10:00:00Z',
    docCount: 18,
    participantsCount: 4,
  },
  {
    id: 'c-003',
    title: 'Garcia v. BlueOcean Shipping',
    client: 'Miguel Garcia',
    jurisdiction: 'ES - National',
    practiceArea: 'Civil',
    status: 'Trial',
    tags: ['Maritime', 'Injury'],
    updatedAt: '2025-09-11T08:00:00Z',
    nextHearing: '2025-09-20T09:00:00Z',
    docCount: 73,
    participantsCount: 9,
  },
  {
    id: 'c-004',
    title: 'Acquisition: Novatech ⇄ PolyLabs',
    client: 'PolyLabs',
    jurisdiction: 'DE - Federal',
    practiceArea: 'Corporate',
    status: 'Closed',
    tags: ['M&A', 'Cross-border'],
    updatedAt: '2025-08-15T12:00:00Z',
    docCount: 120,
    participantsCount: 12,
  },
]

const statusColors: Record<CaseStatus, string> = {
  Open: 'bg-amber-100 text-amber-800 border-amber-200',
  Discovery: 'bg-blue-100 text-blue-800 border-blue-200',
  Trial: 'bg-violet-100 text-violet-800 border-violet-200',
  Closed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
}

function CasesPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<CaseStatus | 'All'>('All')
  const [jurisdiction, setJurisdiction] = useState<string | 'All'>('All')
  const [practice, setPractice] = useState<string | 'All'>('All')
  const [chatCase, setChatCase] = useState<Case | null>(null)

  const { location } = useRouterState()
  const isChild = location.pathname !== '/cases'

  const jurisdictions = useMemo(
    () => Array.from(new Set(MOCK_CASES.map((c) => c.jurisdiction))).sort(),
    []
  )
  const practices = useMemo(
    () => Array.from(new Set(MOCK_CASES.map((c) => c.practiceArea))).sort(),
    []
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return MOCK_CASES.filter((c) => {
      const matchesQ =
        !q ||
        c.title.toLowerCase().includes(q) ||
        c.client.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q))

      const matchesStatus = status === 'All' || c.status === status
      const matchesJurisdiction =
        jurisdiction === 'All' || c.jurisdiction === jurisdiction
      const matchesPractice = practice === 'All' || c.practiceArea === practice
      return matchesQ && matchesStatus && matchesJurisdiction && matchesPractice
    }).sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
  }, [search, status, jurisdiction, practice])

  return (
    <div className="flex flex-1 flex-col gap-4">
      {!isChild && (
        <>
      {/* Page header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Cases</h1>
          <p className="text-sm text-muted-foreground">
            Create and manage cases. Search across general law, office documents, and case assets.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline">
            <Upload className="mr-2 size-4" /> Import
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex w-full flex-wrap items-center gap-2 rounded-lg border bg-background p-3">
        <div className="relative ml-1">
          <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search cases, clients, tags..."
            className="pl-8 w-64"
          />
        </div>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <Select value={status} onValueChange={(v) => setStatus(v as any)}>
          <SelectTrigger className="h-9 w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All statuses</SelectItem>
            <SelectItem value="Open">Open</SelectItem>
            <SelectItem value="Discovery">Discovery</SelectItem>
            <SelectItem value="Trial">Trial</SelectItem>
            <SelectItem value="Closed">Closed</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={jurisdiction}
          onValueChange={(v) => setJurisdiction(v as any)}
        >
          <SelectTrigger className="h-9 w-[200px]">
            <SelectValue placeholder="Jurisdiction" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All jurisdictions</SelectItem>
            {jurisdictions.map((j) => (
              <SelectItem key={j} value={j}>
                {j}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={practice} onValueChange={(v) => setPractice(v as any)}>
          <SelectTrigger className="h-9 w-[180px]">
            <SelectValue placeholder="Practice area" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All practice areas</SelectItem>
            {practices.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button size="sm" variant="outline" className="ml-auto">
          <Filter className="mr-2 size-4" /> More filters
        </Button>
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <EmptyCasesState onCreate={() => {}} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <Card key={c.id} className="flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <CardTitle className="text-base leading-tight">
                      {c.title}
                    </CardTitle>
                    <div className="text-sm text-muted-foreground">
                      {c.client}
                    </div>
                  </div>
                  <Badge className={statusColors[c.status]} variant="outline">
                    {c.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-4" /> {c.jurisdiction}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <FileText className="size-4" /> {c.practiceArea}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {c.tags.map((t) => (
                    <Badge key={t} variant="secondary">
                      {t}
                    </Badge>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="size-4" /> {c.participantsCount} participants
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <FileText className="size-4" /> {c.docCount} documents
                  </span>
                  {c.nextHearing && (
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarClock className="size-4" /> Next hearing{' '}
                      {new Date(c.nextHearing).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </CardContent>
              <CardFooter className="mt-auto flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                  Updated {new Date(c.updatedAt).toLocaleDateString()}
                </div>
                <div className="flex items-center gap-2">
                  <Link to={`/cases/${c.id}`} preload={false}>
                    <Button size="sm" variant="outline">
                      Open
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    className="bg-teal-700 text-white hover:bg-teal-600"
                    onClick={() => setChatCase(c)}
                  >
                    <MessageSquare className="mr-2 size-4" /> Chat
                  </Button>
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Right-side Chat Sheet */}
      <Sheet open={!!chatCase} onOpenChange={(open) => !open && setChatCase(null)}>
        <SheetContent side="right" className="w-[480px] p-0">
          <SheetHeader className="p-4 pb-2">
            <SheetTitle className="text-base">
              {chatCase ? `Chat: ${chatCase.title}` : 'Chat'}
            </SheetTitle>
            <p className="text-xs text-muted-foreground">
              Your messages will be grounded in this case’s context once backend wiring is added.
            </p>
          </SheetHeader>
          <Separator />
          <div className="flex h-[calc(100%-4.5rem)] flex-col">
            <ScrollArea className="flex-1 p-4">
              <div className="mx-auto max-w-md text-sm text-muted-foreground">
                <p>
                  Coming soon: threaded responses, citations to general law, office documents, and case files.
                </p>
              </div>
            </ScrollArea>
            <div className="border-t p-3">
              <PromptInput
                onSubmit={async ({ text }, e) => {
                  if (!text?.trim()) return
                  // Placeholder until backend wiring; follow rule: log only message
                  try {
                    // No-op
                  } catch (err) {
                    console.error(err instanceof Error ? err.message : String(err))
                  } finally {
                    e.currentTarget.reset()
                  }
                }}
              >
                <PromptInputBody>
                  <PromptInputTextarea placeholder="Ask about this case…" />
                  <PromptInputToolbar>
                    <div className="ml-auto">
                      <PromptInputSubmit className="bg-teal-700 text-white hover:bg-teal-600" />
                    </div>
                  </PromptInputToolbar>
                </PromptInputBody>
              </PromptInput>
            </div>
          </div>
        </SheetContent>
      </Sheet>
        </>
      )}
      {/* Nested routes render here (e.g., /cases/new) */}
      <Outlet />
    </div>
  )
}

function EmptyCasesState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center py-16">
      <div className="mx-auto max-w-xl text-center">
        <div className="mx-auto mb-6 flex size-12 items-center justify-center rounded-full bg-muted">
          <BriefIcon />
        </div>
        <h2 className="text-xl font-semibold">Create your first case</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Organize documents, collaborate with your team, and chat with the case context.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button variant="outline">
            <Upload className="mr-2 size-4" /> Import
          </Button>
          <Link to="/cases/new" preload={false}>
            <Button className="bg-teal-700 text-white hover:bg-teal-600">
              <Plus className="mr-2 size-4" /> New Case
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}

function BriefIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="size-6 text-muted-foreground"
      aria-hidden
    >
      <path d="M10 7V6a2 2 0 1 1 4 0v1h3a3 3 0 0 1 3 3v2H2v-2a3 3 0 0 1 3-3h5Zm4 0V6a1 1 0 1 0-2 0v1h2ZM2 13h18v4a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3v-4Z" />
    </svg>
  )
}

