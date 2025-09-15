import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

export async function extractPdfText(input: Uint8Array | ArrayBuffer, maxChars = 20000): Promise<string> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
const task = getDocument({ data: bytes, isEvalSupported: false, disableFontFace: true }) as any
  const doc = await task.promise
  try {
    let out = ''
    const pages = doc.numPages as number
    for (let i = 1; i <= pages; i++) {
      const page = await doc.getPage(i)
      const tc = await page.getTextContent({ normalizeWhitespace: true })
      const text = (tc.items as any[]).map((it) => it.str ?? '').join(' ')
      if (text) {
        out += `\n\n[Page ${i}]\n${text}`
      }
      if (out.length >= maxChars) break
    }
    if (out.length > maxChars) out = out.slice(0, maxChars)
    return out.trim()
  } finally {
    try { await doc.destroy?.() } catch {}
  }
}