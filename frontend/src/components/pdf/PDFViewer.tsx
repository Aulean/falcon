import React, { useCallback, useEffect, useMemo, useRef, useState, useImperativeHandle, forwardRef } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Trash2, MousePointer2, Hand, Upload, Link as LinkIcon, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, Search, Download } from 'lucide-react'

// react-pdf / pdfjs worker setup
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

// Import styles
import 'react-pdf/dist/Page/TextLayer.css'
import 'react-pdf/dist/Page/AnnotationLayer.css'

// Prevent re-rendering of react-pdf Page when selection/tooltips update
// Keeps native text selection from disappearing
const MemoPage = React.memo(Page as unknown as React.FC<any>) as unknown as typeof Page

// Types
export interface RectNorm {
  id: string
  page: number
  // Normalized [0..1] coordinates relative to rendered page size
  x: number
  y: number
  w: number
  h: number
  color?: string
  label?: string
  source?: 'manual' | 'auto'
}

export interface NoteAnn {
  id: string
  page: number
  x: number
  y: number
  text: string
}

export type DrawMode = 'pan' | 'draw' | 'note'

export interface PDFViewerProps {
  /** Backend URL for proxying requests */
  backendUrl?: string
  /** Default PDF URL to load */
  defaultUrl?: string
  /** Initial draw mode */
  initialDrawMode?: DrawMode
  /** Initial zoom level */
  initialZoom?: number
  /** Enable phrase search functionality */
  enablePhraseSearch?: boolean
  /** Enable AI search functionality */
  enableAISearch?: boolean
  /** Enable export functionality */
  enableExport?: boolean
  /** Initial phrases for search */
  initialPhrases?: string
  /** Callback when highlights change */
  onHighlightsChange?: (highlights: RectNorm[]) => void
  /** Callback when notes change */
  onNotesChange?: (notes: NoteAnn[]) => void
  /** Callback when PDF loads */
  onDocumentLoad?: (info: { numPages: number }) => void
  /** Custom toolbar components */
  customToolbarItems?: React.ReactNode
  /** Hide default toolbar */
  hideToolbar?: boolean
  /** Controlled highlights (external state) */
  highlights?: RectNorm[]
  /** Controlled notes (external state) */
  notes?: NoteAnn[]
  /** PDF source (URL or File) */
  source?: string | File
}

const PDFViewer: React.FC<PDFViewerProps> = ({
  backendUrl = 'http://localhost:3000',
  defaultUrl = '',
  initialDrawMode = 'draw',
  initialZoom = 1,
  enablePhraseSearch = true,
  enableAISearch = true,
  enableExport = true,
  initialPhrases = 'lorem, ipsum',
  onHighlightsChange,
  onNotesChange,
  onDocumentLoad,
  customToolbarItems,
  hideToolbar = false,
  highlights: controlledHighlights,
  notes: controlledNotes,
  source: controlledSource,
}) => {
  // Internal state (used when not controlled)
  const [internalUrlInput, setInternalUrlInput] = useState<string>(defaultUrl)
  const [internalFileUrl, setInternalFileUrl] = useState<string | null>(null)
  const [internalFileObj, setInternalFileObj] = useState<File | null>(null)
  const [internalHighlights, setInternalHighlights] = useState<RectNorm[]>([])
  const [internalNotes, setInternalNotes] = useState<NoteAnn[]>([])

  // Use controlled props if provided, otherwise use internal state
  const urlInput = internalUrlInput
  const setUrlInput = setInternalUrlInput
  const fileUrl = internalFileUrl
  const setFileUrl = setInternalFileUrl
  const fileObj = internalFileObj
  const setFileObj = setInternalFileObj
  const highlights = controlledHighlights ?? internalHighlights
  const setHighlights = useCallback((highlights: RectNorm[] | ((prev: RectNorm[]) => RectNorm[])) => {
    const newHighlights = typeof highlights === 'function' ? highlights(controlledHighlights ?? internalHighlights) : highlights
    if (!controlledHighlights) setInternalHighlights(newHighlights)
    onHighlightsChange?.(newHighlights)
  }, [controlledHighlights, internalHighlights, onHighlightsChange])
  
  const notes = controlledNotes ?? internalNotes
  const setNotes = useCallback((notes: NoteAnn[] | ((prev: NoteAnn[]) => NoteAnn[])) => {
    const newNotes = typeof notes === 'function' ? notes(controlledNotes ?? internalNotes) : notes
    if (!controlledNotes) setInternalNotes(newNotes)
    onNotesChange?.(newNotes)
  }, [controlledNotes, internalNotes, onNotesChange])

  // PDF viewer state
  const [numPages, setNumPages] = useState<number>(0)
  const [pageNumber, setPageNumber] = useState<number>(1)
  const [drawMode, setDrawMode] = useState<DrawMode>(initialDrawMode)
  const [zoom, setZoom] = useState<number>(initialZoom)

  // Measured width of the viewer area
  const viewerRef = useRef<HTMLDivElement | null>(null)
  const [viewerWidth, setViewerWidth] = useState<number>(800)
  
  useEffect(() => {
    const el = viewerRef.current
    if (!el) return
    let raf = 0
    const update = () => {
      const rect = el.getBoundingClientRect()
      const next = Math.max(480, Math.round(rect.width - 8)) // small safety margin
      setViewerWidth(next)
    }
    const schedule = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(update)
    }
    schedule()
    const ro = new ResizeObserver(schedule)
    ro.observe(el)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [])

  // Zoom controls
  const clampZoom = (v: number) => Math.min(3, Math.max(0.5, v))
  const zoomIn = () => setZoom((z) => clampZoom(z + 0.1))
  const zoomOut = () => setZoom((z) => clampZoom(z - 0.1))
  const fitWidth = () => setZoom(1)
  const A4_CSS_PX_WIDTH = 794
  const actualSize = () => {
    const base = Math.max(480, Math.min(1400, Math.round(viewerWidth)))
    if (!base) return
    const idealZoom = clampZoom(A4_CSS_PX_WIDTH / base)
    setZoom(idealZoom)
  }

  // Revoke previous object URLs when replaced
  useEffect(() => {
    return () => {
      if (fileUrl?.startsWith('blob:')) URL.revokeObjectURL(fileUrl)
    }
  }, [fileUrl])

  const onDocumentLoadSuccess = useCallback((info: { numPages: number }) => {
    setNumPages(info.numPages)
    setPageNumber(1)
    onDocumentLoad?.(info)
  }, [onDocumentLoad])

  const onDocumentLoadError = useCallback((err: any) => {
    console.error(err?.message || String(err))
  }, [])

  const proxied = (raw: string) => {
    try {
      const u = new URL(raw)
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        const backend = backendUrl.replace(/\/$/, '')
        return `${backend}/api/proxy?url=${encodeURIComponent(raw)}`
      }
    } catch {}
    return raw
  }

  const source = useMemo(() => {
    if (controlledSource) {
      return controlledSource instanceof File ? URL.createObjectURL(controlledSource) : controlledSource
    }
    return fileUrl || (urlInput.trim() ? proxied(urlInput.trim()) : undefined)
  }, [controlledSource, fileUrl, urlInput])

  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (fileUrl?.startsWith('blob:')) URL.revokeObjectURL(fileUrl)
    const next = URL.createObjectURL(f)
    setFileUrl(next)
    setFileObj(f)
  }

  const loadFromUrl = () => {
    setFileUrl(null)
    setFileObj(null)
  }

  // Highlight management
  const addHighlight = useCallback((rect: Omit<RectNorm, 'id'>) => {
    const id = 'r_' + Math.random().toString(36).slice(2, 10)
    setHighlights((prev) => [...prev, { id, source: 'manual', ...rect }])
  }, [setHighlights])

  const removeHighlight = useCallback((id: string) => {
    setHighlights((prev) => prev.filter((r) => r.id !== id))
  }, [setHighlights])

  const clearHighlights = () => setHighlights((prev) => prev.filter((r) => r.page !== pageNumber))
  
  // Note management
  const addNote = useCallback((n: NoteAnn) => setNotes((prev) => [...prev, n]), [setNotes])
  const updateNote = useCallback((id: string, text: string) => setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, text } : n))), [setNotes])
  const removeNote = useCallback((id: string) => setNotes((prev) => prev.filter((n) => n.id !== id)), [setNotes])
  const clearNotes = () => setNotes((prev) => prev.filter((n) => n.page !== pageNumber))

  // Navigation
  const goPrev = () => setPageNumber((p) => Math.max(1, p - 1))
  const goNext = () => setPageNumber((p) => Math.min(numPages || 1, p + 1))

  // Phrase search state (only if enabled)
  const [phrasesInput, setPhrasesInput] = useState<string>(initialPhrases)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isAiLoading, setIsAiLoading] = useState(false)
  const [isExporting, setIsExporting] = useState<boolean>(false)
  const [exportProgress, setExportProgress] = useState<string>('')
  const [exportAllPages, setExportAllPages] = useState(false)
  const pageHandleRef = useRef<any>(null)
  const [activePhrases, setActivePhrases] = useState<string[]>([])
  const [matchCount, setMatchCount] = useState<number>(0)
  const [matchIndex, setMatchIndex] = useState<number>(-1)

  // Recount matches whenever the page or phrases change
  useEffect(() => {
    if (!enablePhraseSearch) return
    let canceled = false
    ;(async () => {
      const ok = await waitForPageReady()
      if (!ok || canceled) return
      const c = pageHandleRef.current?.countMarks?.() ?? 0
      setMatchCount(c)
      setMatchIndex(c ? 0 : -1)
      if (c) pageHandleRef.current?.setActiveMatch?.(0)
    })()
    return () => { canceled = true }
  }, [pageNumber, activePhrases, caseSensitive, wholeWord, enablePhraseSearch])

  // Helper functions for phrase search
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
  
  async function waitForPageReady(timeoutMs = 4000) {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      if (pageHandleRef.current?.isReady?.()) return true
      await sleep(50)
    }
    return false
  }

  const goToMatch = (delta: number) => {
    if (!matchCount) return
    const next = (((matchIndex < 0 ? 0 : matchIndex) + delta) % matchCount + matchCount) % matchCount
    setMatchIndex(next)
    pageHandleRef.current?.setActiveMatch?.(next)
  }

  async function findAcrossPages(phrases: string[], opts: { caseSensitive?: boolean; wholeWord?: boolean } = {}) {
    setActivePhrases(phrases)
    const original = pageNumber
    let firstPageWithMatch: number | null = null
    let total = 0
    for (let p = 1; p <= (numPages || 1); p++) {
      setPageNumber(p)
      const ok = await waitForPageReady()
      if (!ok) continue
      const c = pageHandleRef.current?.countMarks?.(phrases, opts) ?? 0
      total += c
      if (c && firstPageWithMatch == null) firstPageWithMatch = p
      await sleep(0)
    }
    if (firstPageWithMatch != null) {
      setPageNumber(firstPageWithMatch)
      setMatchIndex(0)
    } else {
      setPageNumber(original)
    }
  }

  const authHeaders = () => {
    const token = (typeof window !== 'undefined' && (localStorage.getItem('AUTH_TOKEN') || sessionStorage.getItem('AUTH_TOKEN'))) || (import.meta as any).env?.VITE_API_TOKEN || ''
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`
    return headers
  }

  async function handleFindPositions() {
    if (!enablePhraseSearch) return
    const phrases = phrasesInput
      .split(/[\\,\\n]/g)
      .map((s) => s.trim())
      .filter(Boolean)
    if (!phrases.length) return

    try {
      setIsAnalyzing(true)
      setActivePhrases(phrases)
      const ok = await waitForPageReady()
      if (ok) {
        const c = pageHandleRef.current?.countMarks?.() ?? 0
        setMatchCount(c)
        setMatchIndex(c ? 0 : -1)
        if (c) pageHandleRef.current?.setActiveMatch?.(0)
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
    } finally {
      setIsAnalyzing(false)
    }
  }

  async function handleFindWithAI() {
    if (!enableAISearch) return
    const prompt = phrasesInput.trim()
    if (!prompt) return
    try {
      setIsAiLoading(true)
      let res: Response
      if (fileObj) {
        const fd = new FormData()
        fd.append('file', fileObj, fileObj.name)
        fd.append('prompt', prompt)
        res = await fetch(`${backendUrl}/api/ai/pdf/find`, { method: 'POST', headers: authHeaders(), body: fd })
      } else if (urlInput.trim()) {
        res = await fetch(`${backendUrl}/api/ai/pdf/find`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ url: urlInput.trim(), prompt }),
        })
      } else {
        return
      }
      const data = await res.json().catch(() => null)
      if (!res.ok || !data || !Array.isArray(data.phrases)) {
        console.error('ai find error', data)
        return
      }
      await findAcrossPages(data.phrases, { caseSensitive: !!data.caseSensitive, wholeWord: !!data.wholeWord })
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
    } finally {
      setIsAiLoading(false)
    }
  }

  // Export functionality
  function parseRgba(color?: string): { r: number; g: number; b: number; a: number } {
    const fallback = { r: 1, g: 0.905, b: 0.451, a: 0.42 }
    if (!color) return fallback
    const m = color.match(/rgba?\\(([^)]+)\\)/i)
    if (!m) return fallback
    const parts = m[1].split(',').map((s) => parseFloat(s.trim()))
    const [r, g, b, a] = [parts[0] ?? 255, parts[1] ?? 231, parts[2] ?? 115, parts[3] ?? 0.42]
    return { r: Math.min(1, Math.max(0, r / 255)), g: Math.min(1, Math.max(0, g / 255)), b: Math.min(1, Math.max(0, b / 255)), a: Math.min(1, Math.max(0, a)) }
  }

  async function gatherRectsForExport(fullDocument = true): Promise<Record<number, { width: number; height: number; rects: { x: number; y: number; w: number; h: number; color?: string }[] }>> {
    if (!enableExport) return {}
    
    const out: Record<number, { width: number; height: number; rects: { x: number; y: number; w: number; h: number; color?: string }[] }> = {}
    
    // Match on-screen highlight colors when color is not explicitly set
    const colorFor = (h: RectNorm) => {
      if (h && typeof h.color === 'string' && h.color) return h.color
      return 'rgba(59, 130, 246, 0.25)'
    }
    
    if (fullDocument) {
      const defaultPageDimensions = { width: 595, height: 842 }
      
      for (const h of highlights) {
        const pg = h.page
        if (!out[pg]) {
          out[pg] = { width: defaultPageDimensions.width, height: defaultPageDimensions.height, rects: [] }
        }
        const pdfX = h.x * defaultPageDimensions.width
        const pdfW = h.w * defaultPageDimensions.width
        const pdfH = h.h * defaultPageDimensions.height
        const pdfY = defaultPageDimensions.height - (h.y * defaultPageDimensions.height) - pdfH
        
        out[pg].rects.push({
          x: pdfX,
          y: pdfY,
          w: pdfW,
          h: pdfH,
          color: colorFor(h)
        })
      }
      
      if (activePhrases && activePhrases.length && pageHandleRef.current?.getVisibleMarkRectsExt) {
        const ok = await waitForPageReady()
        if (ok) {
          const ext = pageHandleRef.current.getVisibleMarkRectsExt?.()
          if (ext && ext.width && ext.height) {
            const currentPage = pageNumber
            if (!out[currentPage]) {
              out[currentPage] = { width: ext.width, height: ext.height, rects: [] }
            } else {
              out[currentPage].width = ext.width
              out[currentPage].height = ext.height
            }
            
            const rects = (ext.rects || []) as { x: number; y: number; w: number; h: number }[]
            for (const r of rects) {
              out[currentPage].rects.push({ ...r, color: 'rgba(255,231,115,0.42)' })
            }
          }
        }
      }
    } else {
      if (activePhrases && activePhrases.length && pageHandleRef.current?.getVisibleMarkRectsExt) {
        const ext = pageHandleRef.current.getVisibleMarkRectsExt?.()
        const width = ext?.width || 0
        const height = ext?.height || 0
        if (!out[pageNumber]) out[pageNumber] = { width, height, rects: [] }
        
        const rects = (ext?.rects || []) as { x: number; y: number; w: number; h: number }[]
        for (const r of rects) out[pageNumber].rects.push({ ...r, color: 'rgba(255,231,115,0.42)' })
      }
      
      for (const h of highlights.filter(h => h.page === pageNumber)) {
        if (!out[pageNumber]) {
          out[pageNumber] = { width: 595, height: 842, rects: [] }
        }
        const { width, height } = out[pageNumber]
        out[pageNumber].rects.push({ 
          x: h.x * width, 
          y: h.y * height, 
          w: h.w * width, 
          h: h.h * height, 
          color: colorFor(h) 
        })
      }
    }
    
    return out
  }

  function bytesLookLikePdf(ab: ArrayBuffer): boolean {
    try {
      const u8 = new Uint8Array(ab)
      const maxScan = Math.min(u8.length, 1024)
      for (let i = 0; i <= maxScan - 5; i++) {
        if (
          u8[i] === 0x25 && // %
          u8[i + 1] === 0x50 && // P
          u8[i + 2] === 0x44 && // D
          u8[i + 3] === 0x46 && // F
          u8[i + 4] === 0x2D // -
        ) return true
      }
      return false
    } catch { return false }
  }

  async function exportPdfWithHighlights() {
    if (!enableExport) return
    try {
      setIsExporting(true)
      setExportProgress('')
      let pdfBytes: ArrayBuffer | null = null
      if (fileObj) {
        pdfBytes = await fileObj.arrayBuffer()
      } else if (urlInput.trim()) {
        const res = await fetch(proxied(urlInput.trim()))
        if (!res.ok) throw new Error('Failed to fetch PDF')
        pdfBytes = await res.arrayBuffer()
      }
      if (!pdfBytes) throw new Error('No PDF source to export')
      const sizeBytes = (pdfBytes as ArrayBuffer).byteLength || 0
      setExportProgress(`PDF size: ${sizeBytes.toLocaleString()} bytes`)
      if (!bytesLookLikePdf(pdfBytes)) {
        throw new Error('Loaded bytes do not look like a PDF (missing %PDF- header). Check the URL/file and authentication.')
      }

      const notesByPage: Record<number, { x: number; y: number; text: string }[]> = {}
      for (const n of notes) {
        if (!notesByPage[n.page]) notesByPage[n.page] = []
        notesByPage[n.page].push({ x: n.x, y: n.y, text: n.text })
      }

      let worker: Worker
      let payload: any

      if (exportAllPages) {
        worker = new Worker(new URL('../../workers/pdfExportFull.worker.ts', import.meta.url), { type: 'module' })
        payload = {
          phrases: activePhrases || [],
          searchOptions: { caseSensitive, wholeWord },
          manualHighlights: highlights,
          notesByPage,
          filename: 'document-with-highlights.pdf',
        }
      } else {
        const rectsByPage = await gatherRectsForExport(false)
        worker = new Worker(new URL('../../workers/pdfExport.worker.ts', import.meta.url), { type: 'module' })
        payload = {
          pages: rectsByPage,
          notesByPage,
          filename: 'document-with-highlights.pdf',
        }
      }

      const result: ArrayBuffer = await new Promise((resolve, reject) => {
        let settled = false
        const settle = (fn: Function, arg?: any) => {
          if (settled) return
          settled = true
          try { worker.terminate() } catch {}
          fn(arg)
        }
        
        worker.onmessage = (ev) => {
          try {
            const msg = ev.data || {}
            if (msg && typeof msg === 'object') {
              if ('progress' in msg && typeof msg.progress === 'string') {
                setExportProgress(msg.progress)
                return
              }
              if ('ok' in msg) {
                if (msg.ok && msg.data) return settle(resolve, msg.data as ArrayBuffer)
                const errText = (msg.error && String(msg.error)) || 'Export failed'
                console.error('Worker reported error:', msg)
                return settle(reject, new Error(errText))
              }
            }
          } catch (msgErr) {
            settle(reject, new Error(`Message handling error: ${msgErr}`))
          }
        }
        
        worker.onerror = (e) => {
          const error = e.error || e.message || 'Worker error'
          console.error('Worker error event:', e)
          settle(reject, new Error(`Worker error: ${error}`))
        }
        
        try {
          const src = new Uint8Array(pdfBytes as ArrayBuffer)
          const copy = new Uint8Array(src.byteLength)
          copy.set(src)
          payload.pdfBytes = copy
          worker.postMessage(payload)
        } catch (postErr) {
          settle(reject, new Error(`Failed to send message to worker: ${postErr}`))
        }
      })

      const blob = new Blob([result], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'document-with-highlights.pdf'
      a.rel = 'noopener'
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      setTimeout(() => {
        URL.revokeObjectURL(url)
        a.remove()
      }, 2000)
    } catch (err) {
      console.error('Export error:', err)
      const errorMsg = err instanceof Error ? err.message : String(err)
      setExportProgress(`Error: ${errorMsg}`)
      setTimeout(() => setExportProgress(''), 3000)
    } finally {
      setIsExporting(false)
      setExportProgress('')
    }
  }

  return (
    <div className="flex flex-col h-full w-full gap-3 p-3">
      {!hideToolbar && (
        <div className="flex flex-wrap items-center gap-2">
          {/* URL/File input section */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">URL</label>
            <div className="flex items-center gap-2">
              <Input
                placeholder="https://example.com/file.pdf"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="w-[360px]"
              />
              <Button variant="outline" size="sm" onClick={loadFromUrl}>
                <LinkIcon className="size-4 mr-1" /> Load URL
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">File</label>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-2">
                <input type="file" accept="application/pdf" onChange={handleFileChange} className="hidden" id="pdfFileInput" />
                <Button asChild variant="outline" size="sm">
                  <label htmlFor="pdfFileInput" className="cursor-pointer inline-flex items-center">
                    <Upload className="size-4 mr-1" /> Choose
                  </label>
                </Button>
              </label>
            </div>
          </div>
          
          <Separator className="mx-2 h-6" />
          
          {/* Drawing tools */}
          <div className="flex items-center gap-2">
            <Button variant={drawMode === 'draw' ? 'default' : 'outline'} size="sm" onClick={() => setDrawMode('draw')}>
              <MousePointer2 className="size-4 mr-1" /> Draw
            </Button>
            <Button variant={drawMode === 'pan' ? 'default' : 'outline'} size="sm" onClick={() => setDrawMode('pan')}>
              <Hand className="size-4 mr-1" /> Pan
            </Button>
            <Button variant={drawMode === 'note' ? 'default' : 'outline'} size="sm" onClick={() => setDrawMode('note')}>
              <span className="mr-1">🗒️</span> Note
            </Button>
            <Button variant="outline" size="sm" onClick={clearHighlights}>
              <Trash2 className="size-4 mr-1" /> Clear Page Highlights
            </Button>
            <Button variant="outline" size="sm" onClick={clearNotes}>
              <Trash2 className="size-4 mr-1" /> Clear Page Notes
            </Button>
            
            {enableExport && (
              <>
                <Button variant="default" size="sm" onClick={exportPdfWithHighlights} disabled={isExporting || !source} title="Download PDF with highlights" className="bg-teal-700 text-white hover:bg-teal-600">
                  {isExporting ? (
                    <span className="inline-flex items-center gap-1">
                      <span className="inline-block size-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> 
                      {exportProgress || 'Export'}
                    </span>
                  ) : (
                    <><Download className="size-4 mr-1" /> Download</>
                  )}
                </Button>
                <label className="flex items-center gap-1 text-xs text-muted-foreground ml-2">
                  <input type="checkbox" checked={exportAllPages} onChange={(e) => setExportAllPages(e.target.checked)} disabled={isExporting} />
                  All pages (phrases + manual highlights + notes)
                </label>
              </>
            )}
          </div>
          
          {/* Search section */}
          {enablePhraseSearch && (
            <div className="ml-auto flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="phrases (comma-separated)"
                  value={phrasesInput}
                  onChange={(e) => setPhrasesInput(e.target.value)}
                  className="w-[280px]"
                />
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} />
                  Case
                </label>
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  <input type="checkbox" checked={wholeWord} onChange={(e) => setWholeWord(e.target.checked)} />
                  Word
                </label>
                <Button variant="outline" size="sm" onClick={handleFindPositions} disabled={isAnalyzing || !source} title="Find and highlight matches">
                  <Search className="size-4" />
                </Button>
                {enableAISearch && (
                  <Button variant="outline" size="sm" onClick={handleFindWithAI} disabled={!source || isAiLoading} title="Ask AI to find">
                    {isAiLoading ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-block size-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        AI
                      </span>
                    ) : (
                      'AI'
                    )}
                  </Button>
                )}
                <div className="flex items-center gap-1 text-xs text-muted-foreground ml-2">
                  <span>{matchCount} found</span>
                  <Button variant="outline" size="sm" disabled={!matchCount} onClick={() => goToMatch(-1)} title="Previous match">
                    <ChevronLeft className="size-4" />
                  </Button>
                  <div className="w-12 text-center">{matchCount ? matchIndex + 1 : 0}/{matchCount}</div>
                  <Button variant="outline" size="sm" disabled={!matchCount} onClick={() => goToMatch(1)} title="Next match">
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
          
          {/* Zoom and navigation controls */}
          <Button variant="outline" size="sm" onClick={zoomOut} title="Zoom out">
            <ZoomOut className="size-4" />
          </Button>
          <div className="text-xs w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</div>
          <Button variant="outline" size="sm" onClick={zoomIn} title="Zoom in">
            <ZoomIn className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={fitWidth} title="Fit width">
            <Maximize2 className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={actualSize} title="Actual size (A4)">
            <span className="text-xs font-medium">A4</span>
          </Button>
          <Separator className="mx-1 h-6" />
          <Button variant="outline" size="sm" onClick={goPrev} disabled={pageNumber <= 1}>
            <ChevronLeft className="size-4" />
          </Button>
          <div className="text-sm">
            Page {pageNumber} / {numPages || 0}
          </div>
          <Button variant="outline" size="sm" onClick={goNext} disabled={pageNumber >= (numPages || 1)}>
            <ChevronRight className="size-4" />
          </Button>
          
          {/* Custom toolbar items */}
          {customToolbarItems}
        </div>
      )}

      <div ref={viewerRef} className="flex-1 min-h-0 overflow-auto bg-background rounded-md border p-3">
        {!source ? (
          <div className="h-full grid place-items-center text-sm text-muted-foreground">
            Provide a PDF URL or choose a file to begin.
          </div>
        ) : (
          <Document
            file={source}
            onLoadSuccess={onDocumentLoadSuccess as any}
            onLoadError={onDocumentLoadError as any}
            loading={<div className="p-6 text-sm text-muted-foreground">Loading PDF…</div>}
            error={<div className="p-6 text-sm text-red-600">Failed to load PDF.</div>}
            className="flex justify-center w-full"
          >
            <PDFPageWithHighlights
              ref={pageHandleRef}
              pageNumber={pageNumber}
              drawMode={drawMode}
              zoom={zoom}
              containerWidth={viewerWidth}
              highlights={highlights.filter((h) => h.page === pageNumber && h.source !== 'auto')}
              onAddHighlight={(rect) => addHighlight({ ...rect, page: pageNumber })}
              onRemoveHighlight={removeHighlight}
              phrases={activePhrases}
              searchCaseSensitive={caseSensitive}
              searchWholeWord={wholeWord}
              activeMatchIndex={matchIndex}
              notes={notes.filter((n) => n.page === pageNumber)}
              onAddNote={(n) => addNote(n)}
              onUpdateNote={updateNote}
              onRemoveNote={removeNote}
            />
          </Document>
        )}
      </div>
    </div>
  )
}

const PDFPageWithHighlights = forwardRef(function PDFPageWithHighlights({
  pageNumber,
  drawMode,
  zoom,
  containerWidth,
  highlights,
  onAddHighlight,
  onRemoveHighlight,
  phrases,
  searchCaseSensitive,
  searchWholeWord,
  activeMatchIndex,
  notes,
  onAddNote,
  onUpdateNote,
  onRemoveNote
}: {
  pageNumber: number
  drawMode: DrawMode
  zoom: number
  containerWidth: number
  highlights: RectNorm[]
  onAddHighlight: (rect: Omit<RectNorm, 'id' | 'page'> & { page?: number }) => void
  onRemoveHighlight: (id: string) => void
  phrases: string[]
  searchCaseSensitive: boolean
  searchWholeWord: boolean
  activeMatchIndex: number
  notes: NoteAnn[]
  onAddNote: (n: NoteAnn) => void
  onUpdateNote: (id: string, text: string) => void
  onRemoveNote: (id: string) => void
}, ref: React.Ref<any>) {
  const pageWrapRef = useRef<HTMLDivElement | null>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const baseWidth = Math.max(480, Math.min(1400, Math.round(containerWidth)))
  const renderWidth = Math.round(baseWidth * zoom)

  // Stable DPR so <Page> doesn’t re-render on unrelated state updates
  const devicePixelRatioStable = useMemo(() => (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1), [])

  // Stable custom text renderer so Page identity stays the same when tooltips/notes change
  const customTextRenderer = useCallback(({ str }: { str: string }) => {
    const text = String(str)
    if (!phrases || phrases.length === 0) return text

    const escape = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const parts = phrases.map((p) => (searchWholeWord ? `\\b${escape(p)}\\b` : escape(p)))
    if (parts.length === 0) return text

    const flags = searchCaseSensitive ? 'g' : 'gi'
    const re = new RegExp(`(${parts.join('|')})`, flags)

    // Find all matches and their positions
    const matches: { start: number; end: number; text: string }[] = []
    let match: RegExpExecArray | null
    re.lastIndex = 0
    while ((match = re.exec(text))) {
      matches.push({ start: match.index, end: match.index + match[0].length, text: match[0] })
    }

    // Sort matches by position
    matches.sort((a, b) => a.start - b.start)

    // Merge overlapping matches to avoid stacked highlights
    const mergedMatches: { start: number; end: number; text: string }[] = []
    for (const m of matches) {
      const last = mergedMatches[mergedMatches.length - 1]
      if (last && m.start <= last.end) {
        // Overlapping or adjacent - merge them
        last.end = Math.max(last.end, m.end)
        last.text = text.slice(last.start, last.end)
      } else {
        mergedMatches.push({ ...m })
      }
    }

    // Build result with non-overlapping highlights
    let result = ''
    let lastIndex = 0
    for (const m of mergedMatches) {
      // Add text before the match
      result += text.slice(lastIndex, m.start)
      // Add highlighted text with improved styling
      result += `<mark data-pdfmark=\"1\" style=\"background: linear-gradient(135deg, rgba(34, 197, 94, 0.2) 0%, rgba(34, 197, 94, 0.3) 100%); color: rgba(0, 0, 0, 0.9); -webkit-text-fill-color: rgba(0, 0, 0, 0.9); border-radius: 3px; padding: 1px 2px; margin: 0; box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2); font-weight: 500;\">${m.text}</mark>`
      lastIndex = m.end
    }
    // Add remaining text
    result += text.slice(lastIndex)

    return result
  }, [phrases, searchCaseSensitive, searchWholeWord])

  const onRenderSuccess = useCallback(() => {}, [])
  const onLoadError = useCallback((err: any) => console.error(err?.message || String(err)), [])

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const [previewRect, setPreviewRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  const onMouseDown: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (drawMode === 'note') {
      const overlay = overlayRef.current
      if (!overlay) return
      const rect = overlay.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const { clientWidth: W, clientHeight: H } = overlay
      const id = 'n_' + Math.random().toString(36).slice(2, 9)
      onAddNote({ id, page: pageNumber, x: x / W, y: y / H, text: '' })
      setEditingNoteId(id)
      return
    }
    if (drawMode !== 'draw') return
    const overlay = overlayRef.current
    if (!overlay) return
    const rect = overlay.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setIsDrawing(true)
    startRef.current = { x, y }
    setPreviewRect({ x, y, w: 0, h: 0 })
  }

  const onMouseMove: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (!isDrawing) return
    const overlay = overlayRef.current
    if (!overlay) return
    const rect = overlay.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const s = startRef.current
    if (!s) return
    const left = Math.min(s.x, x)
    const top = Math.min(s.y, y)
    const w = Math.abs(x - s.x)
    const h = Math.abs(y - s.y)
    setPreviewRect({ x: left, y: top, w, h })
  }

  const finishDrawing = (commit: boolean) => {
    const overlay = overlayRef.current
    if (!overlay) return
    const s = startRef.current
    const p = previewRect
    setIsDrawing(false)
    startRef.current = null

    if (!commit || !s || !p || p.w < 6 || p.h < 6) {
      setPreviewRect(null)
      return
    }

    const { clientWidth: W, clientHeight: H } = overlay
    const rectNorm = {
      page: pageNumber,
      x: p.x / W,
      y: p.y / H,
      w: p.w / W,
      h: p.h / H,
      color: 'rgba(255, 231, 115, 0.42)',
    }
    onAddHighlight(rectNorm)
    setPreviewRect(null)
  }

  const onMouseUp: React.MouseEventHandler<HTMLDivElement> = () => finishDrawing(true)
  const onMouseLeave: React.MouseEventHandler<HTMLDivElement> = () => finishDrawing(false)

  // Expose phrase/match controls to parent via text layer DOM
  useImperativeHandle(ref, () => ({
    isReady() {
      return Boolean(pageWrapRef.current?.querySelector('.react-pdf__Page__textContent'))
    },
    countMarks() {
      const tl = pageWrapRef.current?.querySelector('.react-pdf__Page__textContent') as HTMLElement | null
      if (!tl) return 0
      return tl.querySelectorAll('mark[data-pdfmark="1"]').length
    },
    setActiveMatch(idx: number) {
      const tl = pageWrapRef.current?.querySelector('.react-pdf__Page__textContent') as HTMLElement | null
      if (!tl) return
      const marks = Array.from(tl.querySelectorAll('mark[data-pdfmark="1"]')) as HTMLElement[]
      marks.forEach((m, i) => {
        if (i === idx) {
          m.style.outline = '2px solid rgb(34 197 94)'
          m.style.outlineOffset = '1px'
          m.style.background = 'linear-gradient(135deg, rgba(34, 197, 94, 0.4) 0%, rgba(34, 197, 94, 0.5) 100%)'
          m.style.boxShadow = '0 0 0 1px rgba(34, 197, 94, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 2px 4px rgba(34, 197, 94, 0.2)'
          m.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
        } else {
          m.style.outline = ''
          m.style.outlineOffset = ''
          m.style.background = 'linear-gradient(135deg, rgba(34, 197, 94, 0.2) 0%, rgba(34, 197, 94, 0.3) 100%)'
          m.style.boxShadow = '0 0 0 1px rgba(34, 197, 94, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
        }
      })
    },
    getVisibleMarkRects() {
      const tl = pageWrapRef.current?.querySelector('.react-pdf__Page__textContent') as HTMLElement | null
      if (!tl) return [] as { x: number; y: number; w: number; h: number }[]
      const tlRect = tl.getBoundingClientRect()
      const marks = Array.from(tl.querySelectorAll('mark[data-pdfmark="1"]')) as HTMLElement[]
      const out: { x: number; y: number; w: number; h: number }[] = []
      for (const m of marks) {
        for (const r of Array.from(m.getClientRects())) {
          const x = (r.left - tlRect.left) / tlRect.width
          const y = (r.top - tlRect.top) / tlRect.height
          const w = r.width / tlRect.width
          const h = r.height / tlRect.height
          if (isFinite(x) && isFinite(y) && isFinite(w) && isFinite(h) && w > 0 && h > 0) out.push({ x, y, w, h })
        }
      }
      return out
    },
    getVisibleMarkRectsExt() {
      const tl = pageWrapRef.current?.querySelector('.react-pdf__Page__textContent') as HTMLElement | null
      if (!tl) return { width: 0, height: 0, rects: [] as { x: number; y: number; w: number; h: number }[] }
      const tlRect = tl.getBoundingClientRect()
      const marks = Array.from(tl.querySelectorAll('mark[data-pdfmark="1"]')) as HTMLElement[]
      const rects: { x: number; y: number; w: number; h: number }[] = []
      for (const m of marks) {
        for (const r of Array.from(m.getClientRects())) {
          const x = r.left - tlRect.left
          const y = r.top - tlRect.top
          const w = r.width
          const h = r.height
          if (isFinite(x) && isFinite(y) && isFinite(w) && isFinite(h) && w > 0 && h > 0) rects.push({ x, y, w, h })
        }
      }
      return { width: tlRect.width, height: tlRect.height, rects }
    },
    findPhrases(phrases: string[], opts: { caseSensitive?: boolean; wholeWord?: boolean } = {}) {
      const tl = pageWrapRef.current?.querySelector('.react-pdf__Page__textContent') as HTMLElement | null
      const overlay = overlayRef.current
      if (!tl || !overlay) return []

      const rawSpans = Array.from(tl.querySelectorAll('span')) as HTMLSpanElement[]
      const atoms: { node: Text; text: string; rect: DOMRect }[] = []
      for (const s of rawSpans) {
        const tn = Array.from(s.childNodes).find((n) => n.nodeType === Node.TEXT_NODE) as Text | undefined
        const text = (tn?.textContent ?? '')
        if (!tn || text.length === 0) continue
        const r = s.getBoundingClientRect()
        atoms.push({ node: tn, text, rect: r })
      }
      if (!atoms.length) return []

      atoms.sort((a, b) => (a.rect.top - b.rect.top) || (a.rect.left - b.rect.left))
      const lineTol = 3
      type Line = { top: number; atoms: typeof atoms }
      const lines: Line[] = []
      for (const a of atoms) {
        const line = lines.find((L) => Math.abs(L.top - a.rect.top) <= lineTol)
        if (line) {
          line.atoms.push(a)
        } else {
          lines.push({ top: a.rect.top, atoms: [a] })
        }
      }
      for (const L of lines) L.atoms.sort((a, b) => a.rect.left - b.rect.left)

      function escapeRegExp(x: string) { return x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
      const flags = opts.caseSensitive ? 'g' : 'gi'
      const overlayRect = overlay.getBoundingClientRect()
      const results: { x: number; y: number; w: number; h: number }[] = []

      const STOPWORDS = new Set([
        'the','a','an','and','or','to','of','in','on','at','by','for','with','is','are','was','were','be','been','being','that','this','it','as','from','into','over','under','than'
      ])
      const normalizedPhrases = (phrases || [])
        .map((p) => (p ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim())
        .filter((p) => p.length >= 3 && !STOPWORDS.has(p.toLowerCase()))

      for (const phraseRaw of normalizedPhrases) {
        const phrase = phraseRaw || ''
        if (!phrase) continue
        const pat = opts.wholeWord ? new RegExp(`\\b${escapeRegExp(phrase)}\\b`, flags) : new RegExp(escapeRegExp(phrase), flags)

        for (const line of lines) {
          let cursor = 0
          const segs: { node: Text; start: number; len: number }[] = []
          const lineText = line.atoms.map((a) => {
            segs.push({ node: a.node, start: cursor, len: a.text.length })
            cursor += a.text.length
            return a.text
          }).join('')
          if (!lineText) continue

          let m: RegExpExecArray | null
          pat.lastIndex = 0
          while ((m = pat.exec(lineText))) {
            const start = m.index
            const end = start + m[0].length
            let i = 0
            while (i < segs.length && segs[i].start + segs[i].len <= start) i++
            let j = 0
            while (j < segs.length && segs[j].start + segs[j].len < end) j++
            if (i >= segs.length || j >= segs.length) continue

            const range = document.createRange()
            const startOffset = Math.max(0, Math.min(segs[i].len, start - segs[i].start))
            const endOffset = Math.max(0, Math.min(segs[j].len, end - segs[j].start))
            range.setStart(segs[i].node, startOffset)
            range.setEnd(segs[j].node, endOffset)

            const rects = Array.from(range.getClientRects())
            for (const r of rects) {
              const x = (r.left - overlayRect.left) / overlayRect.width
              const y = (r.top - overlayRect.top) / overlayRect.height
              const w = r.width / overlayRect.width
              const h = r.height / overlayRect.height
              if (isFinite(x) && isFinite(y) && isFinite(w) && isFinite(h) && w > 0 && h > 0) {
                results.push({ x, y, w, h })
              }
            }
          }
        }
      }
      return results
    }
  }))

  // Render manual highlight rectangles
  const renderHighlightDiv = (h: RectNorm) => {
    return (
      <div
        key={h.id}
        data-hid={h.id}
        className="absolute rounded-sm"
        style={{
          left: `${h.x * 100}%`,
          top: `${h.y * 100}%`,
          width: `${h.w * 100}%`,
          height: `${h.h * 100}%`,
          background: h.color || 'rgba(59, 130, 246, 0.25)',
          outline: '1px solid rgba(59, 130, 246, 0.5)',
          boxShadow: '0 0 0 1px rgba(59, 130, 246, 0.3) inset, 0 2px 4px rgba(59, 130, 246, 0.1)',
          cursor: 'pointer',
        }}
        title={h.label || 'Click to delete highlight'}
        onClick={(e) => {
          e.stopPropagation()
          onRemoveHighlight(h.id)
        }}
      />
    )
  }

  return (
    <div className="flex justify-center">
      <div ref={pageWrapRef} className="relative" style={{ width: renderWidth }}>
        <MemoPage
          pageNumber={pageNumber}
          width={baseWidth}
          scale={zoom}
          devicePixelRatio={devicePixelRatioStable}
          renderAnnotationLayer
          renderTextLayer
          customTextRenderer={customTextRenderer}
          onRenderSuccess={onRenderSuccess}
          onLoadError={onLoadError}
        />

        <div
          ref={overlayRef}
          className="absolute inset-0 select-none"
          style={{ cursor: drawMode === 'draw' ? 'crosshair' : 'grab' }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
        >
          {highlights
            .filter((h) => h.page === pageNumber)
            .map((h) => {
              const fix = (v: number) => Math.max(0, Math.min(1, v))
              return renderHighlightDiv({ ...h, x: fix(h.x), y: fix(h.y), w: fix(h.w), h: fix(h.h) })
            })}

          {notes.map((n) => (
            <div key={n.id} className="absolute" style={{ left: `${n.x * 100}%`, top: `${n.y * 100}%` }}>
              <button
                className="px-1 py-0.5 text-xs rounded bg-yellow-200/80 border border-yellow-400 shadow"
                onClick={(e) => { e.stopPropagation(); setEditingNoteId(n.id) }}
                title={n.text || 'Add note'}
              >
                🗒️
              </button>
              {editingNoteId === n.id && (
                <div className="absolute z-10 mt-1 w-64 rounded border bg-white shadow p-2">
                  <textarea defaultValue={n.text} className="w-full h-24 text-sm border rounded p-1" onKeyDown={(e) => { if (e.key === 'Escape') setEditingNoteId(null) }} />
                  <div className="mt-1 flex items-center gap-2 justify-end">
                    <Button size="sm" variant="outline" onClick={() => { onRemoveNote(n.id); setEditingNoteId(null) }}>Delete</Button>
                    <Button size="sm" onClick={(e) => { const ta = (e.currentTarget.parentElement?.previousSibling as HTMLTextAreaElement); onUpdateNote(n.id, ta?.value || ''); setEditingNoteId(null) }}>Save</Button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {previewRect && (
            <div
              className="absolute rounded-sm pointer-events-none"
              style={{
                left: previewRect.x,
                top: previewRect.y,
                width: previewRect.w,
                height: previewRect.h,
                background: 'rgba(255, 231, 115, 0.25)',
                outline: '1px dashed rgba(180, 140, 0, 0.8)',
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
})

export default PDFViewer