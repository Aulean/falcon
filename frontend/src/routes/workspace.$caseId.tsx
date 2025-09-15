import { createFileRoute } from '@tanstack/react-router'
import { CaseWorkspace } from '@/components/case-workspace/CaseWorkspace'

export const Route = createFileRoute('/workspace/$caseId')({
  component: CaseWorkspacePage,
})

function CaseWorkspacePage() {
  const { caseId } = Route.useParams()
  return <CaseWorkspace mode="view" caseId={caseId} />
}