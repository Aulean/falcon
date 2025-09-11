import { PDFDocument, rgb } from 'pdf-lib';

export type HighlightBox = {
  page: number; // zero-based page index
  x: number;
  y: number;
  width: number;
  height: number;
};

export type HighlightOptions = {
  topLeft?: boolean; // if true, convert from top-left origin
  normalize?: boolean; // if true, x/y/w/h are percentages [0..1]
  color?: { r: number; g: number; b: number }; // 0..1 each
  opacity?: number; // 0..1
};

/**
 * Highlights regions on a PDF and returns the modified PDF bytes.
 */
export async function highlightPdf(
  inputPdfBytes: Uint8Array | ArrayBuffer,
  boxes: HighlightBox[],
  opts: HighlightOptions = {}
): Promise<Uint8Array> {
  const topLeft = opts.topLeft ?? false;
  const normalize = opts.normalize ?? false;
  const col = opts.color ?? { r: 1, g: 1, b: 0 }; // yellow
  const opacity = opts.opacity ?? 0.35;

  const bytes = inputPdfBytes instanceof Uint8Array
    ? inputPdfBytes
    : new Uint8Array(inputPdfBytes);

  const pdfDoc = await PDFDocument.load(bytes);

  for (const box of boxes) {
    const pageIndex = Math.max(0, Math.min(pdfDoc.getPageCount() - 1, Math.floor(box.page)));
    const page = pdfDoc.getPage(pageIndex);
    const { width: pw, height: ph } = page.getSize();

    let x = box.x;
    let y = box.y;
    let w = box.width;
    let h = box.height;

    if (normalize) {
      x = x * pw;
      y = y * ph;
      w = w * pw;
      h = h * ph;
    }

    if (topLeft) {
      y = ph - y - h;
    }

    page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      color: rgb(col.r, col.g, col.b),
      opacity,
      borderColor: rgb(col.r, col.g, col.b),
      borderOpacity: opacity,
    });
  }

  const out = await pdfDoc.save();
  return out;
}
