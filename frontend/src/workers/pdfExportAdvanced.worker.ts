// Advanced PDF export worker using pdfjs-dist for proper text extraction
// This worker can analyze the entire PDF and place highlights based on text content

import * as pdfjsLib from 'pdfjs-dist'
import { PDFDocument, rgb, StandardFonts, PDFName, PDFString, PDFBool } from 'pdf-lib'

// Configure pdfjs worker - try different approaches for better compatibility
try {
  // Try using the bundled worker first
  if (typeof pdfjsLib.version !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`
  } else {
    // Fallback to latest version
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist/build/pdf.worker.min.mjs'
  }
} catch (err) {
  console.warn('Failed to configure pdfjs worker:', err)
  // Fallback
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist/build/pdf.worker.min.mjs'
}

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
  dir: string
  width: number
  height: number
  transform: number[]
  fontName: string
  hasEOL?: boolean
}

interface TextContent {
  items: TextItem[]
  styles: Record<string, any>
}

self.onmessage = async (ev) => {
  try {
    console.log('Advanced worker started')
    const data: ExportMessage = ev.data
    if (!data) {
      throw new Error('No data provided to worker')
    }
    if (!data.pdfBytes) {
      throw new Error('No PDF bytes provided')
    }
    console.log('PDF bytes length:', data.pdfBytes.byteLength)

    // Load PDF with pdfjs-dist for text extraction
    console.log('Loading PDF with pdfjs-dist...')
    let pdfDocument: any
    try {
      const loadingTask = pdfjsLib.getDocument({ data: data.pdfBytes })
      pdfDocument = await loadingTask.promise
      console.log('PDF loaded successfully, pages:', pdfDocument.numPages)
    } catch (pdfErr) {
      console.error('Failed to load PDF with pdfjs-dist:', pdfErr)
      throw new Error(`PDF loading failed: ${pdfErr instanceof Error ? pdfErr.message : pdfErr}`)
    }
    
    // Load PDF with pdf-lib for annotation writing
    console.log('Loading PDF with pdf-lib...')
    let pdfDoc: PDFDocument
    let docPages: any[]
    try {
      pdfDoc = await PDFDocument.load(data.pdfBytes)
      docPages = pdfDoc.getPages()
      console.log('PDF-lib loaded successfully, pages:', docPages.length)
    } catch (libErr) {
      console.error('Failed to load PDF with pdf-lib:', libErr)
      throw new Error(`PDF-lib loading failed: ${libErr instanceof Error ? libErr.message : libErr}`)
    }

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

    // Extract text and find phrase matches across all pages (optimized)
    const numPages = pdfDocument.numPages
    const phraseMatches: Array<{
      page: number
      x: number
      y: number
      width: number
      height: number
    }> = []

    if (data.phrases && data.phrases.length > 0 && data.phrases.some(p => p.trim())) {
      // Progress reporting for large documents
      if (numPages > 10) {
        self.postMessage({ progress: `Processing ${numPages} pages...` })
      }

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        if (pageNum % 10 === 0 && numPages > 20) {
          self.postMessage({ progress: `Processing page ${pageNum}/${numPages}...` })
        }

        const page = await pdfDocument.getPage(pageNum)
        const textContent = await page.getTextContent() as TextContent
        const viewport = page.getViewport({ scale: 1.0 })

        // Build text items with their positions (much more efficient than character tracking)
        const textItems: Array<{
          text: string
          x: number
          y: number
          width: number
          height: number
          charOffset: number
        }> = []

        let charOffset = 0
        let fullText = ''

        for (const item of textContent.items) {
          const textItem = item as TextItem
          if (!textItem.str) continue

          const tx = textItem.transform
          const x = tx[4]
          const y = viewport.height - tx[5] // Flip Y coordinate
          
          textItems.push({
            text: textItem.str,
            x: x,
            y: y,
            width: textItem.width,
            height: textItem.height,
            charOffset: charOffset
          })
          
          fullText += textItem.str
          charOffset += textItem.str.length
          
          if (textItem.hasEOL) {
            fullText += '\n'
            charOffset += 1
          } else {
            fullText += ' '
            charOffset += 1
          }
        }

        // Search for each phrase (optimized)
        for (const phrase of data.phrases) {
          if (!phrase.trim()) continue
          
          let searchText = fullText
          let searchPhrase = phrase
          
          if (!data.searchOptions.caseSensitive) {
            searchText = searchText.toLowerCase()
            searchPhrase = searchPhrase.toLowerCase()
          }

          let searchIndex = 0
          while (true) {
            let foundIndex = searchText.indexOf(searchPhrase, searchIndex)
            if (foundIndex === -1) break
            
            // Check word boundaries if wholeWord is enabled
            if (data.searchOptions.wholeWord) {
              const before = foundIndex > 0 ? searchText[foundIndex - 1] : ' '
              const after = foundIndex + searchPhrase.length < searchText.length ? 
                searchText[foundIndex + searchPhrase.length] : ' '
              
              if (!/\W/.test(before) || !/\W/.test(after)) {
                searchIndex = foundIndex + 1
                continue
              }
            }
            
            // Find which text item contains this match (much faster than char tracking)
            let matchStartItem: any = null
            let matchEndItem: any = null
            const matchEnd = foundIndex + searchPhrase.length
            
            for (const item of textItems) {
              const itemEnd = item.charOffset + item.text.length
              
              if (!matchStartItem && foundIndex >= item.charOffset && foundIndex < itemEnd) {
                matchStartItem = item
              }
              if (!matchEndItem && matchEnd > item.charOffset && matchEnd <= itemEnd) {
                matchEndItem = item
              }
              if (matchStartItem && matchEndItem) break
            }
            
            if (matchStartItem && matchEndItem) {
              // Calculate approximate position within the text item
              const startCharInItem = foundIndex - matchStartItem.charOffset
              const charWidth = matchStartItem.width / matchStartItem.text.length
              
              const x = matchStartItem.x + (startCharInItem * charWidth)
              const width = matchStartItem === matchEndItem ? 
                searchPhrase.length * charWidth :
                (matchEndItem.x + matchEndItem.width) - x
              
              phraseMatches.push({
                page: pageNum,
                x: x,
                y: matchStartItem.y - matchStartItem.height,
                width: Math.max(width, charWidth),
                height: matchStartItem.height
              })
            }
            
            searchIndex = foundIndex + 1
          }
        }
      }
    }

    // Add phrase highlights to PDF
    if (phraseMatches.length > 0) {
      self.postMessage({ progress: `Rendering ${phraseMatches.length} highlights...` })
    }
    for (const match of phraseMatches) {
      const page = docPages[match.page - 1]
      if (!page) continue
      
      const c = parseRgba('rgba(255,231,115,0.42)')
      page.drawRectangle({
        x: match.x,
        y: match.y,
        width: match.width,
        height: match.height,
        color: rgb(c.r, c.g, c.b),
        opacity: c.a,
        borderColor: rgb(0.7, 0.55, 0),
        borderWidth: 0.5
      })
    }

    // Add manual highlights
    for (const highlight of data.manualHighlights) {
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
      const { width: pgW, height: pgH } = page.getSize()

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
        const ax = note.x * pgW
        const ay = (1 - note.y) * pgH
        const related = (data.manualHighlights || []).filter((h: any) => h.page === pageNum && typeof h.label === 'string' && h.label.startsWith('note:'))
        let quads: number[][] = []
        for (const h of related) {
          const x = h.x * pgW
          const w = h.w * pgW
          const hh = h.h * pgH
          const y = pgH - (h.y * pgH) - hh
          if ((ax >= x - 6 && ax <= x + w + 6) && (ay >= y - 6 && ay <= y + hh + 6)) {
            quads.push([x, y + hh, x + w, y + hh, x + w, y, x, y])
          }
        }
        if (!quads.length) {
          const wGuess = Math.min(120, pgW * 0.25)
          const hGuess = Math.min(18, pgH * 0.03)
          const x = Math.max(8, Math.min(pgW - 8 - wGuess, ax - wGuess / 2))
          const y = Math.max(8, Math.min(pgH - 8 - hGuess, ay - hGuess / 2))
          quads = [[x, y + hGuess, x + wGuess, y + hGuess, x + wGuess, y, x, y]]
        }
        addHighlightAnnotation(quads, text)
      }
    }

    // Save and return the modified PDF
    const outBytes = await pdfDoc.save()
    const outBuffer = outBytes.buffer.slice(outBytes.byteOffset, outBytes.byteOffset + outBytes.byteLength)
    
    self.postMessage({ ok: true, data: outBuffer }, [outBuffer])
  } catch (err) {
    console.error('Export worker error:', err)
    self.postMessage({ 
      ok: false, 
      error: err instanceof Error ? err.message : String(err) 
    })
  }
}