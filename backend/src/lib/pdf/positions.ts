// Server-side PDF text search using PDF.js without DOMMatrix
// Use the standard ESM build; we avoid DOMMatrix by doing 2D matrix math ourselves
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

// Multiply two PDF.js 2D transform matrices (a,b,c,d,e,f)
function mul6(
  t1: readonly [number, number, number, number, number, number],
  t2: readonly [number, number, number, number, number, number],
) {
  const [a1, b1, c1, d1, e1, f1] = t1
  const [a2, b2, c2, d2, e2, f2] = t2
  const a = a1 * a2 + b1 * c2
  const b = a1 * b2 + b1 * d2
  const c = c1 * a2 + d1 * c2
  const d = c1 * b2 + d1 * d2
  const e = e1 * a2 + f1 * c2 + e2
  const f = e1 * b2 + f1 * d2 + f2
  return [a, b, c, d, e, f] as const
}

export type PhraseBox = {
  page: number // zero-based page index
  x: number
  y: number
  w: number
  h: number
}

export type FindPositionsOptions = {
  caseSensitive?: boolean
  wholeWord?: boolean
}

function normalizeStr(str: string, caseSensitive: boolean) {
  return caseSensitive ? str : str.toLowerCase()
}

export async function findTextPositions(
  inputPdf: Uint8Array | ArrayBuffer,
  phrases: string[],
  opts: FindPositionsOptions = {},
): Promise<{ boxes: PhraseBox[]; pageCount: number }> {
  const caseSensitive = opts.caseSensitive ?? false
  const wholeWord = opts.wholeWord ?? false

  const bytes = inputPdf instanceof Uint8Array ? inputPdf : new Uint8Array(inputPdf)

const loadingTask = getDocument({ data: bytes, isEvalSupported: false, disableFontFace: true, useSystemFonts: true }) as any
  const doc = await loadingTask.promise
  try {
    const pageCount = doc.numPages as number
    const boxes: PhraseBox[] = []

    const normPhrases = phrases
      .map((p) => (p ?? '').trim())
      .filter(Boolean)
      .map((p) => (caseSensitive ? p : p.toLowerCase()))

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await doc.getPage(pageNum)
      const viewport = page.getViewport({ scale: 1 })
      const pageW = viewport.width
      const pageH = viewport.height

      const textContent: any = await page.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false })

      // Group items into lines using hasEOL flag
      type Item = { str: string; transform: number[]; width: number }
      const items: Item[] = textContent.items as Item[]

      let lineItems: Item[] = []
      const lines: Item[][] = []
      for (const it of items) {
        lineItems.push(it)
        // @ts-ignore
        if ((it as any).hasEOL) {
          lines.push(lineItems)
          lineItems = []
        }
      }
      if (lineItems.length) lines.push(lineItems)

      for (const line of lines) {
        const lineStr = line.map((i) => i.str).join('')
        const lineStrNorm = normalizeStr(lineStr, caseSensitive)

        // Build segment map of char positions to items
        const segs = line.map((i) => ({ str: i.str, len: i.str.length, item: i }))

        for (const phraseNorm of normPhrases) {
          if (!phraseNorm) continue

          let searchFrom = 0
          while (true) {
            const idx = lineStrNorm.indexOf(phraseNorm, searchFrom)
            if (idx === -1) break

            // Enforce whole-word if requested
            if (wholeWord) {
              const before = lineStrNorm[idx - 1]
              const after = lineStrNorm[idx + phraseNorm.length]
              const isBoundary = (ch?: string) => !ch || /\W/.test(ch)
              if (!(isBoundary(before) && isBoundary(after))) {
                searchFrom = idx + 1
                continue
              }
            }

            const { x, y, w, h } = boxFromCharRange(segs, idx, phraseNorm.length, viewport)
            // Convert to normalized [0..1] using full page size (consistent with react-pdf width/scale)
            const nx = x / pageW
            const ny = y / pageH
            const nw = w / pageW
            const nh = h / pageH
            if (Number.isFinite(nx) && Number.isFinite(ny) && Number.isFinite(nw) && Number.isFinite(nh)) {
              boxes.push({ page: pageNum - 1, x: nx, y: ny, w: nw, h: nh })
            }

            searchFrom = idx + phraseNorm.length
          }
        }
      }
    }

    return { boxes, pageCount }
  } finally {
    try { await doc.destroy?.() } catch {}
  }
}

function boxFromCharRange(
  segs: { str: string; len: number; item: { transform: number[]; width: number } }[],
  start: number,
  length: number,
  viewport: any,
) {
  let remainingStart = start
  let remainingLen = length

  let started = false
  let xStart = 0
  let yBase = 0
  let totalW = 0
  let maxH = 0

  for (const seg of segs) {
    const segLen = seg.len
    if (!started) {
      if (remainingStart >= segLen) {
        remainingStart -= segLen
        continue
      }
      // This segment contains the start
      // Use item transform directly (already in viewport space)
      const [a, b, c, d, e, f] = seg.item.transform as any
      const segH = Math.hypot(c, d)
      const rawW = Number.isFinite((seg.item as any).width) ? (seg.item as any).width : (seg.str?.length ?? 0) * 0.6
      const segW = Math.max(0, rawW)
      const startOffset = Math.max(0, remainingStart)
      const startRatio = segLen > 0 ? startOffset / segLen : 0
      xStart = e + segW * startRatio
      yBase = f - segH
      maxH = Math.max(maxH, segH)

      const take = Math.min(segLen - startOffset, remainingLen)
      const takeRatio = segLen > 0 ? take / segLen : 0
      totalW += segW * takeRatio
      remainingLen -= take
      started = true
      if (remainingLen <= 0) break
    } else {
      const [a, b, c, d, e, f] = seg.item.transform as any
      const segH = Math.hypot(c, d)
      const rawW = Number.isFinite((seg.item as any).width) ? (seg.item as any).width : (seg.str?.length ?? 0) * 0.6
      const segW = Math.max(0, rawW)
      const take = Math.min(segLen, remainingLen)
      const takeRatio = segLen > 0 ? take / segLen : 0
      totalW += segW * takeRatio
      maxH = Math.max(maxH, segH)
      remainingLen -= take
      if (remainingLen <= 0) break
    }
  }

  return { x: xStart, y: yBase, w: Math.max(1, totalW), h: Math.max(1, maxH) }
}