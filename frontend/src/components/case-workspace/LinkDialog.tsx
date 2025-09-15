import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { addCaseReference, getCaseReferences } from '@/lib/case-workspace-api'

export function LinkDialog({
  caseId,
  open,
  onOpenChange,
  onSelectLocalFiles,
}: {
  caseId?: string
  open: boolean
  onOpenChange: (o: boolean) => void
  onSelectLocalFiles: () => void
}) {
  const [tab, setTab] = useState<'files' | 'links'>('links')
  const [url, setUrl] = useState('')
  const [links, setLinks] = useState<{ id?: string; url: string; title?: string; addedBy?: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    if (!open || !caseId) return
    ;(async () => {
      try {
        setLoading(true)
        const refs = await getCaseReferences(caseId).catch(() => [])
        setLinks(refs.map(r => ({ id: (r as any).id, url: r.url, title: r.title })))
      } finally {
        setLoading(false)
      }
    })()
  }, [open, caseId])

  async function handleAdd() {
    const value = url.trim()
    if (!value || !caseId) return
    try {
      setAdding(true)
      await addCaseReference(caseId, { url: value, title: value })
      setUrl('')
      const refs = await getCaseReferences(caseId).catch(() => [])
      setLinks(refs.map(r => ({ id: (r as any).id, url: r.url, title: r.title })))
    } finally {
      setAdding(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 grid place-items-center">
      <div className="absolute inset-0 bg-black/40" onClick={() => onOpenChange(false)} />
      <div className="relative z-10 w-[720px] max-w-[95vw] rounded-2xl bg-white p-4 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-2 py-1">
          <h2 className="text-xl font-medium text-slate-900">Sources</h2>
          <button className="text-slate-500 hover:text-slate-700" onClick={() => onOpenChange(false)} aria-label="Close">✕</button>
        </div>

        {/* Tabs */}
        <div className="mt-2 flex items-center gap-6 border-b px-2">
          <button className={cn('py-2 text-sm', tab === 'files' ? 'text-slate-900 border-b-2 border-slate-900' : 'text-slate-500')} onClick={() => setTab('files')}>Local files</button>
          <button className={cn('py-2 text-sm', tab === 'links' ? 'text-slate-900 border-b-2 border-slate-900' : 'text-slate-500')} onClick={() => setTab('links')}>Links</button>
        </div>

        {/* Content */}
        {tab === 'files' ? (
          <div className="p-4">
            <p className="text-sm text-slate-500 mb-3">Select files from your device to add to this case.</p>
            <Button className="bg-teal-700 text-white hover:bg-teal-600" onClick={() => { onOpenChange(false); onSelectLocalFiles() }}>Choose files…</Button>
          </div>
        ) : (
          <div className="p-4">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Add your domain (i.e. example.com)"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="flex-1 bg-white border-slate-300"
                disabled={!caseId}
              />
              <Button className="bg-teal-700 text-white hover:bg-teal-600" disabled={adding || !url.trim() || !caseId} onClick={handleAdd}>+ Add Link</Button>
            </div>
            {!caseId && (
              <div className="mt-2 text-xs text-slate-500">Please wait a moment—creating the case…</div>
            )}

            <div className="mt-4 border-t">
              {loading ? (
                <div className="p-6 text-sm text-slate-500">Loading…</div>
              ) : links.length === 0 ? (
                <div className="p-12 text-center text-sm text-slate-500">Add some links to your case</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="py-2">Domain</th>
                      <th className="py-2">Added by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {links.map(l => (
                      <tr key={l.id || l.url} className="border-t">
                        <td className="py-2 text-slate-800">{l.url}</td>
                        <td className="py-2 text-slate-500">You</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
