// Web worker for exporting PDF with highlights using pdf-lib
// This runs off the main thread to avoid UI jank and accidental refreshes

self.onmessage = async (ev) => {
  try {
    const { pdfBytes, pages: pagesSpec, notesByPage } = ev.data || {}
    if (!pdfBytes) throw new Error('No PDF bytes provided')

    const { PDFDocument, rgb, StandardFonts, PDFName, PDFString, PDFBool } = await import('pdf-lib')
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

    // Add non-blocking underline markup annotation near anchor
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
        C: pdfDoc.context.obj([1, 1, 0]) // yellow underline
      })
      const annotRef = pdfDoc.context.register(annot)
      const annots: any = page.node.get(PDFName.of('Annots'))
      if (annots) annots.push(annotRef)
      else page.node.set(PDFName.of('Annots'), pdfDoc.context.obj([annotRef]))
    }

    for (const key of Object.keys(notesByPage || {})) {
      const p = Number(key)
      const page = docPages[(p - 1) | 0]
      if (!page) continue
      const { width: pgW, height: pgH } = page.getSize()
      const notes = notesByPage[key] || []

      const spec = (pagesSpec || {})[key]
      const isAlreadyPdfPoints = spec && Math.abs(spec.width - pgW) < 50 && Math.abs(spec.height - pgH) < 50
      const sx = spec ? (isAlreadyPdfPoints ? 1 : pgW / spec.width) : 1
      const sy = spec ? (isAlreadyPdfPoints ? 1 : pgH / spec.height) : 1

      const rects = (spec && spec.rects) ? spec.rects : []

      const rectToPdfQuad = (r: any) => {
        const x = r.x * sx
        const w = r.w * sx
        const h = r.h * sy
        const y = isAlreadyPdfPoints ? r.y : pgH - (r.y * sy) - h
        return { x, y, w, h, quad: [x, y + h, x + w, y + h, x + w, y, x, y] as number[] }
      }

      const addHighlightAnnotation = (page: any, quads: number[][], text: string) => {
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

      for (const n of notes) {
        const text = String(n.text || '').trim()
        if (!text) continue
        // Anchor in spec coordinates (top-left origin) if spec available
        const axSpec = spec ? (n.x * spec.width) : (n.x * pgW)
        const aySpec = spec ? (n.y * spec.height) : ((1 - n.y) * pgH) // if no spec, fallback to pdf coords later

        let candidateRects: any[] = []
        if (spec) {
          candidateRects = rects.filter((r: any) => axSpec >= r.x && axSpec <= r.x + r.w && aySpec >= r.y && aySpec <= r.y + r.h)
          if (candidateRects.length === 0) {
            // fallback: nearby rects within 24px
            candidateRects = rects.filter((r: any) => Math.abs((r.x + r.w / 2) - axSpec) < 24 && Math.abs((r.y + r.h / 2) - aySpec) < 24).slice(0, 3)
          }
        }

        const quads: number[][] = []
        for (const r of candidateRects) {
          quads.push(rectToPdfQuad(r).quad)
        }

        if (quads.length === 0) {
          // last resort: create a reasonable box around anchor
          const wSpec = spec ? spec.width : pgW
          const hSpec = spec ? spec.height : pgH
          const widthGuess = Math.min(120, (wSpec * 0.25))
          const heightGuess = Math.min(18, (hSpec * 0.03))
          const rx = Math.max(0, Math.min((spec ? axSpec : n.x * wSpec) - widthGuess / 2, wSpec - widthGuess))
          const ryTop = spec ? Math.max(0, Math.min(aySpec - heightGuess / 2, hSpec - heightGuess)) : null
          const ry = spec ? ryTop! : (pgH - ((1 - n.y) * pgH) - heightGuess / 2) // unused when spec set
          const rTemp = spec ? { x: rx, y: ryTop!, w: widthGuess, h: heightGuess } : null
          if (spec && rTemp) quads.push(rectToPdfQuad(rTemp).quad)
          else {
            // directly in pdf coords
            const x = Math.max(8, Math.min(pgW - 8 - widthGuess, n.x * pgW - widthGuess / 2))
            const y = Math.max(8, Math.min(pgH - 8 - heightGuess, (1 - n.y) * pgH - heightGuess / 2))
            quads.push([x, y + heightGuess, x + widthGuess, y + heightGuess, x + widthGuess, y, x, y])
          }
        }

        addHighlightAnnotation(page, quads, text)
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
