// Full-document PDF export worker using pdfjs-dist inside the worker (no UI/DOM)
// - Parses the entire PDF in this worker with pdf.js (disableWorker: true)
// - Finds phrase matches across all pages using text items (fast, no per-char tracking)
// - Renders highlights and marginal notes with pdf-lib

// IMPORTANT: This worker avoids using a nested pdf.js core worker by passing disableWorker: true
// so it won't conflict with React-PDF's own worker in the main thread.

import { getDocument } from 'pdfjs-dist/build/pdf'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

interface ExportMessage {
  pdfBytes: ArrayBuffer
  phrases: string[]
  searchOptions: {
    caseSensitive?: boolean
    wholeWord?: boolean
  }
  manualHighlights: Array<{
    page: number
    x: number
    y: number
    w: number
    h: number
    color?: string
  }>
  notesByPage: Record<number, Array<{
    x: number
    y: number
    text: string
  }>>
  filename?: string
}

interface TextItem {
  str: string
  width: number
  height: number
  transform: number[]
  fontName: string
  hasEOL?: boolean
}

self.onmessage = async (ev) => {
  try {
    const data = ev.data as ExportMessage
    if (!data || !data.pdfBytes) throw new Error('No PDF bytes provided')

    const phrases = (data.phrases || []).filter((p) => p && p.trim())
    const caseSensitive = !!data.searchOptions?.caseSensitive
    const wholeWord = !!data.searchOptions?.wholeWord

    // Load the PDF with pdf.js (display layer) INSIDE THIS WORKER
    // Disable nested worker to avoid conflicts
    const loadingTask = getDocument({ data: data.pdfBytes, disableWorker: true })
    const pdf = await loadingTask.promise

    // Also load with pdf-lib for writing
    const pdfDoc = await PDFDocument.load(data.pdfBytes)
    const libPages = pdfDoc.getPages()

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
        a: Math.min(1, Math.max(0, a)),
      }
    }

    type Match = { page: number; x: number; y: number; width: number; height: number; color?: string }
    const phraseMatches: Match[] = []

    const numPages = pdf.numPages || 0

    if (phrases.length > 0) {
      if (numPages > 10) self.postMessage({ progress: `Scanning ${numPages} pages...` })

      // Pre-normalize phrases for case-sensitivity and build quick testers
      const normalizedPhrases = phrases.map((p) => (caseSensitive ? p : p.toLowerCase()))

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        if (pageNum % 10 === 0 && numPages > 20) self.postMessage({ progress: `Scanning page ${pageNum}/${numPages}...` })

        const page = await pdf.getPage(pageNum)
        const viewport = page.getViewport({ scale: 1.0 })
        const textContent = await page.getTextContent()

        // Build item-level array and unified fullText with char offsets
        const items = textContent.items as TextItem[]
        const textItems: Array<{ text: string; x: number; y: number; width: number; height: number; offset: number }> = []
        let offset = 0
        let fullText = ''

        for (const it of items) {
          const tx = it.transform
          const x = tx[4]
          const yTopLeft = viewport.height - tx[5] // flip y to top-left origin (CSS-like)
          textItems.push({ text: it.str || '', x, y: yTopLeft, width: it.width || 0, height: it.height || 0, offset })
          fullText += it.str || ''
          offset += (it.str || '').length
          // insert a space separator between items to avoid concatenation artifacts
          fullText += ' '
          offset += 1
        }

        // Quick reject if none of the phrases can appear in this page
        const testFull = caseSensitive ? fullText : fullText.toLowerCase()
        const couldMatch = normalizedPhrases.some((p) => p && testFull.includes(p))
        if (!couldMatch) continue

        // For each phrase, find indexes in fullText and map back to item geometry
        for (let pIdx = 0; pIdx < normalizedPhrases.length; pIdx++) {
          const phraseNorm = normalizedPhrases[pIdx]
          const phraseRaw = phrases[pIdx]
          if (!phraseNorm) continue

          let searchIndex = 0
          while (true) {
            const foundIndex = testFull.indexOf(phraseNorm, searchIndex)
            if (foundIndex === -1) break

            // whole word boundary check if requested
            if (wholeWord) {
              const before = foundIndex > 0 ? testFull[foundIndex - 1] : ' '
              const after = (foundIndex + phraseNorm.length) < testFull.length ? testFull[foundIndex + phraseNorm.length] : ' '
              // letters/digits/underscore disallowed adjacent
              const isBoundary = /\W/.test(before) && /\W/.test(after)
              if (!isBoundary) {
                searchIndex = foundIndex + 1
                continue
              }
            }

            const matchEnd = foundIndex + phraseNorm.length
            // Find start/end items containing the match
            let startItem: any = null
            let endItem: any = null

            for (const it of textItems) {
              const itStart = it.offset
              const itEnd = it.offset + it.text.length
              if (!startItem && foundIndex >= itStart && foundIndex < itEnd) startItem = it
              if (!endItem && matchEnd > itStart && matchEnd <= itEnd) endItem = it
              if (startItem && endItem) break
            }

            if (startItem && endItem) {
              const startCharInItem = foundIndex - startItem.offset
              const charWidth = startItem.text.length > 0 ? startItem.width / startItem.text.length : 0
              const x = startItem.x + startCharInItem * charWidth
              const width = startItem === endItem
                ? phraseNorm.length * charWidth
                : (endItem.x + endItem.width) - x

              // Use startItem height; if zero try endItem
              const height = Math.max(startItem.height || 0, endItem.height || 0)
              const y = startItem.y - height

              phraseMatches.push({ page: pageNum, x, y, width: Math.max(width, 0.5), height: Math.max(height, 0.5) })
            }

            searchIndex = foundIndex + 1
          }
        }
      }
    }

    // Draw results with pdf-lib
    if (phraseMatches.length > 0) self.postMessage({ progress: `Rendering ${phraseMatches.length} highlights...` })

    for (const m of phraseMatches) {
      const page = libPages[m.page - 1]
      if (!page) continue
      const { width: pgW, height: pgH } = page.getSize()

      // phrase coords are in viewport pixels (top-left origin); scale to points and flip Y
      // We used viewport scale=1 so viewport.width/height correspond to CSS px. Use ratios.
      // To obtain viewport size here, recompute by querying pdf.js page viewport (scale=1)
      const pdfPage = await pdf.getPage(m.page)
      const viewport = pdfPage.getViewport({ scale: 1.0 })
      const sx = pgW / viewport.width
      const sy = pgH / viewport.height

      const w = m.width * sx
      const h = m.height * sy
      const x = m.x * sx
      const y = pgH - (m.y * sy) - h

      const c = parseRgba('rgba(255,231,115,0.42)')
      page.drawRectangle({ x, y, width: w, height: h, color: rgb(c.r, c.g, c.b), opacity: c.a, borderColor: rgb(0.7, 0.55, 0), borderWidth: 0.5 })
    }

    // Manual highlights are normalized [0..1] in top-left origin
    for (const h of data.manualHighlights || []) {
      const page = libPages[h.page - 1]
      if (!page) continue
      const { width: pgW, height: pgH } = page.getSize()
      const x = h.x * pgW
      const w = h.w * pgW
      const hh = h.h * pgH
      const y = pgH - (h.y * pgH) - hh
      const c = parseRgba(h.color)
      page.drawRectangle({ x, y, width: w, height: hh, color: rgb(c.r, c.g, c.b), opacity: c.a, borderColor: rgb(0.7, 0.55, 0), borderWidth: 0.5 })
    }

    // Marginal notes
    const defaultFont = await pdfDoc.embedFont(StandardFonts.TimesRoman).catch(() => null)
    const fontSize = 9
    const stickyWidth = 160
    const stickyPad = 6
    const stickyBg = rgb(1, 1, 0.8)

    for (const [pageKey, notes] of Object.entries(data.notesByPage || {})) {
      const p = Number(pageKey)
      const page = libPages[p - 1]
      if (!page || !notes || notes.length === 0) continue
      const { width, height } = page.getSize()
      let cursorY = height - 40
      const marginRight = 24
      for (const n of notes) {
        const text = String(n.text || '').trim()
        if (!text) continue
        const x = width - marginRight - stickyWidth
        let y = cursorY
        const maxLineWidth = stickyWidth - stickyPad * 2
        const measure = (s: string) => defaultFont ? defaultFont.widthOfTextAtSize(s, fontSize) : s.length * (fontSize * 0.55)
        const words = text.split(/\s+/)
        const lines: string[] = []
        let line = ''
        for (const w of words) {
          const t = line ? line + ' ' + w : w
          if (measure(t) <= maxLineWidth) line = t
          else { if (line) lines.push(line); line = w }
        }
        if (line) lines.push(line)
        const boxHeight = stickyPad * 2 + lines.length * (fontSize + 2)
        y = Math.max(24, y - boxHeight)
        page.drawRectangle({ x, y, width: stickyWidth, height: boxHeight, color: stickyBg, borderColor: rgb(0.85, 0.75, 0.2), borderWidth: 0.6, opacity: 1 })
        let ty = y + boxHeight - stickyPad - fontSize
        for (const ln of lines) {
          page.drawText(ln, { x: x + stickyPad, y: ty, size: fontSize, color: rgb(0, 0, 0), font: defaultFont || undefined })
          ty -= fontSize + 2
        }
        const anchorX = n.x * width
        const anchorY = (1 - n.y) * height
        page.drawLine({ start: { x: x + stickyWidth, y: y + boxHeight - 8 }, end: { x: anchorX, y: anchorY }, color: rgb(0.4, 0.4, 0.4), thickness: 0.6 })
        cursorY = y - 12
      }
    }

    // Save & return
    const outBytes = await pdfDoc.save()
    const outBuffer = outBytes.buffer.slice(outBytes.byteOffset, outBytes.byteOffset + outBytes.byteLength)
    self.postMessage({ ok: true, data: outBuffer }, [outBuffer])
  } catch (err) {
    self.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
