import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { createCase } from '@/lib/case-workspace-api'

export const Route = createFileRoute('/workspace/new')({
  component: CreateWorkspaceRedirect,
})

function CreateWorkspaceRedirect() {
  const navigate = useNavigate()
  const did = useRef(false)

  useEffect(() => {
    if (did.current) return
    did.current = true
    ;(async () => {
      try {
        const ws = await createCase({ title: '', description: '', context: '', instructions: '', references: [] })
        navigate({ to: '/workspace/$caseId', params: { caseId: ws.id } })
      } catch (err) {
        // Minimal fallback: stay on this page; you may show a toast if desired
        // We intentionally log only message per user rule
        console.error(err instanceof Error ? err.message : String(err))
      }
    })()
  }, [navigate])

  return (
    <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
      Creating workspace…
    </div>
  )
}
