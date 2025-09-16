// Simple PDF export worker for all pages without pdfjs-dist conflicts
// Uses only manual highlights and notes, avoiding text extraction

import { PDFDocument, rgb, StandardFonts, PDFName, PDFString, PDFBool } from 'pdf-lib'

interface ExportMessage {
  pdfBytes: ArrayBuffer
  manualHighlights: Array<{
    page: number
    x: number
    y: number
    w: number
    h: number
    color?: string
  }>
  // Optional extra rects specified in text-layer pixel coordinates per page
  // e.g., current page phrase highlights measured from DOM
  rectPages?: Record<number, {
    width: number
    height: number
    rects: Array<{ x: number; y: number; w: number; h: number; color?: string }>
  }>
  notesByPage: Record<number, Array<{
    x: number
    y: number
    text: string
  }>>
  filename?: string
}

self.onmessage = async (ev) => {
  try {
    console.log('Simple all-pages worker started')
    const data: ExportMessage = ev.data
    if (!data || !data.pdfBytes) {
      throw new Error('No PDF data provided')
    }

    console.log('Loading PDF with pdf-lib...')
    const pdfDoc = await PDFDocument.load(data.pdfBytes)
    const docPages = pdfDoc.getPages()
    console.log('PDF loaded, processing', docPages.length, 'pages')

    const parseRgba = (color?: string) => {
      if (!color) return { r: 1, g: 0.905, b: 0.451, a: 0.42 }
      const m = String(color).match(/rgba?\(([^)]+)\)/i)
      if (!m) return { r: 1, g: 0.905, b: 0.451, a: 0.42 }
      const parts = m[1].split(',').map((s) => parseFloat(s.trim()))
      const [r, g, b, a] = [parts[0] ?? 255, parts[1] ?? 231, parts[2] ?? 115, parts[3] ?? 0.42]
      return { 
        r: Math.min(1, Math.max(0, r / 255)), 
        g: Math.min(1, Math.max(0, g / 255)), 
        b: Math.min(1, Math.max(0, b / 255)), 
        a: Math.min(1, Math.max(0, a)) 
      }
    }

    // Add manual highlights to all pages
    for (const highlight of data.manualHighlights || []) {
      const page = docPages[highlight.page - 1]
      if (!page) continue
      
      const { width: pgW, height: pgH } = page.getSize()
      const c = parseRgba(highlight.color)
      
      // Convert normalized coordinates to PDF points with Y flip
      const x = highlight.x * pgW
      const w = highlight.w * pgW
      const h = highlight.h * pgH
      const y = pgH - (highlight.y * pgH) - h
      
      page.drawRectangle({
        x, y, width: w, height: h,
        color: rgb(c.r, c.g, c.b),
        opacity: c.a,
        borderColor: rgb(0.7, 0.55, 0),
        borderWidth: 0.5
      })
    }

    // Add any extra rects provided per page (e.g., current-page phrase marks from DOM)
    if (data.rectPages) {
      for (const key of Object.keys(data.rectPages)) {
        const p = Number(key)
        const spec = data.rectPages[p]
        const page = docPages[p - 1]
        if (!page || !spec || !spec.width || !spec.height) continue
        const { width: pgW, height: pgH } = page.getSize()
        const sx = pgW / spec.width
        const sy = pgH / spec.height
        for (const r of spec.rects || []) {
          const c = parseRgba(r.color)
          const x = r.x * sx
          const w = r.w * sx
          const h = r.h * sy
          const y = pgH - (r.y * sy) - h
          page.drawRectangle({ x, y, width: w, height: h, color: rgb(c.r, c.g, c.b), opacity: c.a, borderColor: rgb(0.7, 0.55, 0), borderWidth: 0.5 })
        }
      }
    }

    console.log('Added', data.manualHighlights.length, 'manual highlights')

    // Add non-blocking underline markup annotations near anchors
    let totalNotes = 0
    const addUnderlineAnnotation = (page: any, x: number, y: number, text: string) => {
      const width = 40
      const height = 2
      const rect = pdfDoc.context.obj([x, y, x + width, y + height])
      const quad = pdfDoc.context.obj([
        x, y + height,
        x + width, y + height,
        x + width, y,
        x, y,
      ])
      const annot = pdfDoc.context.obj({
        Type: PDFName.of('Annot'),
        Subtype: PDFName.of('Underline'),
        Rect: rect,
        QuadPoints: quad,
        Contents: PDFString.of(text),
        C: pdfDoc.context.obj([1, 1, 0])
      })
      const annotRef = pdfDoc.context.register(annot)
      const annots: any = page.node.get(PDFName.of('Annots'))
      if (annots) annots.push(annotRef)
      else page.node.set(PDFName.of('Annots'), pdfDoc.context.obj([annotRef]))
    }

    for (const [pageKey, notes] of Object.entries(data.notesByPage)) {
      const pageNum = Number(pageKey)
      const page = docPages[pageNum - 1]
      if (!page || !notes.length) continue
      
      totalNotes += notes.length
      const { width: pgW, height: pgH } = page.getSize()

      // Build helper to add highlight annotation
      const addHighlightAnnotation = (quads: number[][], text: string) => {
        if (!quads.length) return
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        for (const q of quads) {
          minX = Math.min(minX, q[0], q[6])
          minY = Math.min(minY, q[5], q[7])
          maxX = Math.max(maxX, q[2], q[4])
          maxY = Math.max(maxY, q[1], q[3])
        }
        const rect = pdfDoc.context.obj([minX, minY, maxX, maxY])
        const flat = ([] as number[]).concat(...quads)
        const annot = pdfDoc.context.obj({
          Type: PDFName.of('Annot'),
          Subtype: PDFName.of('Highlight'),
          Rect: rect,
          QuadPoints: pdfDoc.context.obj(flat),
          Contents: PDFString.of(text),
          C: pdfDoc.context.obj([1, 1, 0])
        })
        const ref = pdfDoc.context.register(annot)
        const annots: any = page.node.get(PDFName.of('Annots'))
        if (annots) annots.push(ref)
        else page.node.set(PDFName.of('Annots'), pdfDoc.context.obj([ref]))
      }

      for (const note of notes) {
        const text = String(note.text || '').trim()
        if (!text) continue
        // Try to match an existing manual highlight under the anchor
        const ax = note.x * pgW
        const ay = (1 - note.y) * pgH
        let matched: { x: number; y: number; w: number; h: number } | null = null
        for (const h of data.manualHighlights || []) {
          if (h.page !== pageNum) continue
          const x = h.x * pgW
          const w = h.w * pgW
          const hh = h.h * pgH
          const y = pgH - (h.y * pgH) - hh
          if (ax >= x && ax <= x + w && ay >= y && ay <= y + hh) { matched = { x, y, w, h: hh }; break }
        }
        let quads: number[][] = []
        if (matched) {
          const { x, y, w, h } = matched
          quads = [[x, y + h, x + w, y + h, x + w, y, x, y]]
        } else {
          // fallback rectangle around anchor
          const wGuess = Math.min(120, pgW * 0.25)
          const hGuess = Math.min(18, pgH * 0.03)
          const x = Math.max(8, Math.min(pgW - 8 - wGuess, ax - wGuess / 2))
          const y = Math.max(8, Math.min(pgH - 8 - hGuess, ay - hGuess / 2))
          quads = [[x, y + hGuess, x + wGuess, y + hGuess, x + wGuess, y, x, y]]
        }
        addHighlightAnnotation(quads, text)
      }
    }

    console.log('Added', totalNotes, 'note annotations')
        
        cursorY = y - 12
      }
    }

    console.log('Added', totalNotes, 'marginal notes')

    // Save and return the modified PDF
    console.log('Saving PDF...')
    const outBytes = await pdfDoc.save()
    const outBuffer = outBytes.buffer.slice(outBytes.byteOffset, outBytes.byteOffset + outBytes.byteLength)
    
    console.log('Export completed successfully')
    self.postMessage({ ok: true, data: outBuffer }, [outBuffer])
  } catch (err) {
    console.error('Simple export worker error:', err)
    self.postMessage({ 
      ok: false, 
      error: err instanceof Error ? err.message : String(err) 
    })
  }
}