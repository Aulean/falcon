// Web worker for exporting PDF with highlights using pdf-lib
// This runs off the main thread to avoid UI jank and accidental refreshes

self.onmessage = async (ev) => {
  try {
    const { pdfBytes, pages: pagesSpec, notesByPage } = ev.data || {}
    if (!pdfBytes) throw new Error('No PDF bytes provided')

    const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib')
    const pdfDoc = await PDFDocument.load(pdfBytes)

    const docPages = pdfDoc.getPages()

    const parseRgba = (color) => {
      if (!color) return { r: 1, g: 0.905, b: 0.451, a: 0.42 }
      const m = String(color).match(/rgba?\(([^)]+)\)/i)
      if (!m) return { r: 1, g: 0.905, b: 0.451, a: 0.42 }
      const parts = m[1].split(',').map((s) => parseFloat(s.trim()))
      const [r, g, b, a] = [parts[0] ?? 255, parts[1] ?? 231, parts[2] ?? 115, parts[3] ?? 0.42]
      return { r: Math.min(1, r / 255), g: Math.min(1, g / 255), b: Math.min(1, b / 255), a: Math.min(1, Math.max(0, a)) }
    }

    // pages is a map: pageNumber -> { width, height, rects }
    // The coordinates may be in different systems:
    // - For single page: text layer pixels (needs scaling)
    // - For full document: PDF points (already scaled)
    for (const key of Object.keys(pagesSpec || {})) {
      const p = Number(key)
      const spec = pagesSpec[key] || { width: 0, height: 0, rects: [] }
      const page = docPages[(p - 1) | 0]
      if (!page || !spec.width || !spec.height) continue
      const { width: pgW, height: pgH } = page.getSize()
      
      // Detect coordinate system: if dimensions are close to PDF points, assume already scaled
      const isAlreadyPdfPoints = Math.abs(spec.width - pgW) < 50 && Math.abs(spec.height - pgH) < 50
      
      let sx, sy
      if (isAlreadyPdfPoints) {
        // Coordinates are already in PDF points
        sx = 1
        sy = 1
      } else {
        // Coordinates are in text-layer pixels, need scaling
        sx = pgW / spec.width
        sy = pgH / spec.height
      }
      
      for (const r of spec.rects) {
        const x = r.x * sx
        const w = r.w * sx
        const h = r.h * sy
        let y
        if (isAlreadyPdfPoints) {
          // PDF coordinates: origin at bottom-left, already correct
          y = r.y
        } else {
          // Text layer coordinates: origin at top-left, flip Y axis
          y = pgH - (r.y * sy) - h
        }
        const c = parseRgba(r.color)
        page.drawRectangle({ x, y, width: w, height: h, color: rgb(c.r, c.g, c.b), opacity: c.a, borderColor: rgb(0.7, 0.55, 0), borderWidth: 0.5 })
      }
    }

    // Add marginal notes (standard printable approximation)
    // Strategy: draw a small sticky rectangle in the right margin with wrapped note text.
    const defaultFont = await pdfDoc.embedFont(StandardFonts.TimesRoman).catch(() => null)
    const fontSize = 9
    const stickyWidth = 160
    const stickyPad = 6
    const stickyBg = rgb(1, 1, 0.8) // light yellow

    for (const key of Object.keys(notesByPage || {})) {
      const p = Number(key)
      const page = docPages[(p - 1) | 0]
      if (!page) continue
      const { width, height } = page.getSize()
      const notes = notesByPage[key] || []
      // Stack notes down from the top-right margin, avoiding content area
      let cursorY = height - 40
      const marginRight = 24
      for (const n of notes) {
        const text = String(n.text || '').trim()
        if (!text) continue
        const x = width - marginRight - stickyWidth
        let y = cursorY
        const maxLineWidth = stickyWidth - stickyPad * 2
        // naive wrap: split by spaces
        const words = text.split(/\s+/)
        const lines = []
        let line = ''
        const measure = (s) => (defaultFont ? defaultFont.widthOfTextAtSize(s, fontSize) : s.length * (fontSize * 0.55))
        for (const w of words) {
          const test = line ? line + ' ' + w : w
          if (measure(test) <= maxLineWidth) line = test
          else { lines.push(line); line = w }
        }
        if (line) lines.push(line)
        const boxHeight = stickyPad * 2 + lines.length * (fontSize + 2)
        y = Math.max(24, y - boxHeight)
        // sticky background
        page.drawRectangle({ x, y, width: stickyWidth, height: boxHeight, color: stickyBg, borderColor: rgb(0.85, 0.75, 0.2), borderWidth: 0.6, opacity: 1 })
        // text
        let ty = y + boxHeight - stickyPad - fontSize
        for (const ln of lines) {
          page.drawText(ln, { x: x + stickyPad, y: ty, size: fontSize, color: rgb(0, 0, 0), font: defaultFont || undefined })
          ty -= fontSize + 2
        }
        // connector line from anchor to sticky
        const anchorX = n.x * width
        const anchorY = (1 - n.y) * height
        page.drawLine({ start: { x: x + stickyWidth, y: y + boxHeight - 8 }, end: { x: anchorX, y: anchorY }, color: rgb(0.4, 0.4, 0.4), thickness: 0.6 })
        cursorY = y - 12
      }
    }

    const outBytes = await pdfDoc.save()
    // Transfer the underlying ArrayBuffer, not the typed array itself
    const outBuffer = outBytes.buffer.slice(outBytes.byteOffset, outBytes.byteOffset + outBytes.byteLength)
    self.postMessage({ ok: true, data: outBuffer }, [outBuffer])
  } catch (err) {
    self.postMessage({ ok: false, error: err?.message || String(err) })
  }
}
