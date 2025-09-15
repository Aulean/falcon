// Simple PDF export worker for all pages without pdfjs-dist conflicts
// Uses only manual highlights and notes, avoiding text extraction

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

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

    // Add marginal notes
    const defaultFont = await pdfDoc.embedFont(StandardFonts.TimesRoman).catch(() => null)
    const fontSize = 9
    const stickyWidth = 160
    const stickyPad = 6
    const stickyBg = rgb(1, 1, 0.8)

    let totalNotes = 0
    for (const [pageKey, notes] of Object.entries(data.notesByPage)) {
      const pageNum = Number(pageKey)
      const page = docPages[pageNum - 1]
      if (!page || !notes.length) continue
      
      totalNotes += notes.length
      const { width, height } = page.getSize()
      let cursorY = height - 40
      const marginRight = 24

      for (const note of notes) {
        const text = String(note.text || '').trim()
        if (!text) continue
        
        const x = width - marginRight - stickyWidth
        let y = cursorY
        const maxLineWidth = stickyWidth - stickyPad * 2
        
        // Text wrapping
        const words = text.split(/\s+/)
        const lines: string[] = []
        let line = ''
        const measure = (s: string) => defaultFont ? 
          defaultFont.widthOfTextAtSize(s, fontSize) : 
          s.length * (fontSize * 0.55)
        
        for (const word of words) {
          const test = line ? line + ' ' + word : word
          if (measure(test) <= maxLineWidth) {
            line = test
          } else {
            if (line) lines.push(line)
            line = word
          }
        }
        if (line) lines.push(line)
        
        const boxHeight = stickyPad * 2 + lines.length * (fontSize + 2)
        y = Math.max(24, y - boxHeight)
        
        // Draw sticky note background
        page.drawRectangle({
          x, y, width: stickyWidth, height: boxHeight,
          color: stickyBg,
          borderColor: rgb(0.85, 0.75, 0.2),
          borderWidth: 0.6,
          opacity: 1
        })
        
        // Draw text lines
        let ty = y + boxHeight - stickyPad - fontSize
        for (const textLine of lines) {
          page.drawText(textLine, {
            x: x + stickyPad,
            y: ty,
            size: fontSize,
            color: rgb(0, 0, 0),
            font: defaultFont || undefined
          })
          ty -= fontSize + 2
        }
        
        // Draw connector line from note anchor to sticky
        const anchorX = note.x * width
        const anchorY = (1 - note.y) * height
        page.drawLine({
          start: { x: x + stickyWidth, y: y + boxHeight - 8 },
          end: { x: anchorX, y: anchorY },
          color: rgb(0.4, 0.4, 0.4),
          thickness: 0.6
        })
        
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