import { Hono } from 'hono';
import { streamText, embed, tool, generateObject, convertToModelMessages } from 'ai';
import { z } from 'zod';
import { azure } from '@lib/ai/azure';
import { googleAI } from '@lib/ai/google';
import { openai } from '@ai-sdk/openai';
import { PDFDocument, rgb } from 'pdf-lib';
import { highlightPdf } from '@lib/pdf/highlight';

const router = new Hono();

// In-memory file store for uploaded attachments referenced by tools
const uploadStore = new Map<string, { bytes: Uint8Array; contentType: string; filename: string }>();

// POST /api/ai/chat (streams Server-Sent Events)
// Body: { messages: { role: 'user' | 'system' | 'assistant', content: string }[] }
router.post('/chat', async (c) => {
  try {
    const ct = c.req.header('content-type')?.toLowerCase() || '';
    let messages: any[] = [];
    let attachedFileUrls: { url: string; filename: string; contentType: string }[] = [];
    const uploadedFiles: { base64: string; contentType: string; filename: string }[] = [];

    if (ct.includes('multipart/form-data')) {
      const form = await c.req.formData();
      const m = form.get('messages');
      let messagesStr: string | null = null;
      if (typeof m === 'string') {
        messagesStr = m;
      } else if (m instanceof File) {
        try { messagesStr = await m.text(); } catch { messagesStr = null; }
      }
      if (messagesStr) {
        try { messages = JSON.parse(messagesStr); } catch { messages = []; }
      }

      // Convert uploaded files to base64 so tools can consume fileBase64 directly (no external bucket)
      const files = form.getAll('files');
      for (const f of files) {
        if (f instanceof File) {
          const ab = await f.arrayBuffer();
          const base64 = Buffer.from(ab).toString('base64');
          uploadedFiles.push({ base64, contentType: f.type || 'application/pdf', filename: f.name || 'file.pdf' });
        }
      }
    } else {
      const body = await c.req.json().catch(() => ({}));
      messages = Array.isArray((body as any)?.messages) ? (body as any).messages : [];
      // Accept attachments array in JSON (fileUrl)
      const atts = Array.isArray((body as any)?.attachments) ? (body as any).attachments : [];
      attachedFileUrls = atts
        .map((a: any) => ({ url: String(a?.fileUrl || a?.url || ''), filename: String(a?.filename || 'file'), contentType: String(a?.contentType || 'application/octet-stream') }))
        .filter((a: any) => a.url);
    }

    // If there are uploaded files, inform the model how to call the tool
    if (uploadedFiles.length > 0) {
      messages.push({
        role: 'system',
        content:
          `The user uploaded ${uploadedFiles.length} PDF file(s). To process them, call the highlightPdf tool. If you omit fileUrl and fileBase64, the tool will use the first uploaded PDF by default.`,
      });
    } else if (attachedFileUrls.length > 0) {
      const list = attachedFileUrls
        .map((f, i) => `${i + 1}. ${f.filename} (${f.contentType}) -> ${f.url}`)
        .join('\n');
      messages.push({
        role: 'system',
        content:
          `The user attached the following files. When appropriate, call tools using the provided fileUrl(s):\n${list}`,
      });
    }

    const model = azure('gpt-5-mini');

    console.log('[chat] content-type:', ct, 'messages:', messages.length, 'uploadedFiles:', uploadedFiles.length, 'attachments:', attachedFileUrls.length);

    // Convert incoming UI messages (with parts) to model messages expected by streamText
    let modelMessages: any[];
    try {
      modelMessages = convertToModelMessages(messages as any);
      console.log('[chat] converted messages to model format:', modelMessages.length);
    } catch (err) {
      console.error('[chat] message conversion error:', err instanceof Error ? err.message : String(err));
      modelMessages = messages; // fallback to raw messages if conversion fails
    }

    // Register tools for the model (function calling)
    const highlightPdfParams = z.object({
      // Provide either fileUrl or fileBase64
      fileUrl: z.string().url().optional(),
      fileBase64: z.string().optional(),
      boxes: z
        .array(
          z.object({
            page: z.number().int(),
            x: z.number(),
            y: z.number(),
            width: z.number(),
            height: z.number(),
          }),
        )
        .describe(
          'List of rectangles to highlight. Coordinates in PDF points from bottom-left unless topLeft=true. If normalize=true, treat values as percentages [0..1].',
        ),
      topLeft: z.boolean().optional().default(false),
      normalize: z.boolean().optional().default(false),
    });

    const baseOrigin = new URL(c.req.url).origin;
    const highlightPdfTool = tool({
      description:
        'Highlight regions on a PDF and return a downloadable link. Use when the user asks to mark, annotate, or highlight parts of a PDF.',
      inputSchema: highlightPdfParams,
      execute: async (
        { fileUrl, fileBase64, boxes, topLeft = false, normalize = false }: z.infer<typeof highlightPdfParams>,
      ) => {
        try {
          console.log('[tool:highlightPdf] called with', {
            hasFileUrl: Boolean(fileUrl),
            hasFileBase64: Boolean(fileBase64),
            uploadedFilesCount: uploadedFiles.length,
            boxesCount: Array.isArray(boxes) ? boxes.length : 0,
            topLeft,
            normalize,
          });

          let inputBytes: Uint8Array;
          if (fileBase64 && fileBase64.length > 0) {
            inputBytes = Buffer.from(fileBase64, 'base64');
          } else if (fileUrl && fileUrl.length > 0) {
            const resp = await fetch(fileUrl);
            if (!resp.ok) throw new Error(`Failed to fetch file from URL: ${resp.status}`);
            const ab = await resp.arrayBuffer();
            inputBytes = new Uint8Array(ab);
          } else if (uploadedFiles.length > 0) {
            inputBytes = Buffer.from(uploadedFiles[0].base64, 'base64');
          } else {
            throw new Error('Either fileUrl or fileBase64 must be provided');
          }

          if (!boxes || boxes.length === 0) {
            console.warn('[tool:highlightPdf] No boxes provided - returning note.');
            return 'No highlight boxes were provided. Please specify rectangles or ask me to search for terms and compute boxes.';
          }

          const out = await highlightPdf(inputBytes, boxes, { topLeft, normalize });
          const id = crypto.randomUUID();
          uploadStore.set(id, { bytes: out, contentType: 'application/pdf', filename: 'highlighted.pdf' });
          const url = `${baseOrigin}/api/ai/uploads/${id}`;
          console.log('[tool:highlightPdf] generated highlighted PDF at', url, 'bytes:', out.length);
          // Return a short string so the model can include it in the reply.
          return `I generated a highlighted PDF. Download it here: ${url}`;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error('[tool:highlightPdf] error', msg);
          throw new Error('PDF highlight tool failed');
        }
      },
    });

    const result = await streamText({
      model,
      messages: [
        { role: 'system', content: 'You can highlight PDFs using the highlightPdf tool. If the user wants a highlighted PDF, call highlightPdf with either a fileUrl or fileBase64 and the appropriate boxes.' },
        ...modelMessages,
      ],
      tools: { highlightPdf: highlightPdfTool },
      activeTools: ['highlightPdf'],
    });

    console.log('[chat] started streaming');
    const response = result.toUIMessageStreamResponse();
    return response;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return c.json({ error: 'Failed to generate chat response' }, 500);
  }
});

// Direct upload endpoint (temporary): client sends multipart with single 'file', returns a public URL
router.post('/upload', async (c) => {
  try {
    const form = await c.req.formData();
    const f = form.get('file');
    if (!(f instanceof File)) return c.json({ error: 'file is required' }, 400);
    const id = crypto.randomUUID();
    const bytes = new Uint8Array(await f.arrayBuffer());
    uploadStore.set(id, { bytes, contentType: f.type || 'application/octet-stream', filename: f.name || 'file' });
    const base = new URL(c.req.url);
    const url = `${base.origin}/api/ai/uploads/${id}`;
    return c.json({ url, filename: f.name || 'file', contentType: f.type || 'application/octet-stream' });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return c.json({ error: 'Upload failed' }, 500);
  }
});

// Analyze PDF via file content (for models that support file inputs)
router.post('/analyze', async (c) => {
  try {
    const form = await c.req.formData();
    const pdf = form.get('pdf');
    const prompt = String(form.get('prompt') ?? 'Analyze this PDF and summarize it.');
    if (!(pdf instanceof File)) {
      return c.json({ error: 'pdf is required (multipart/form-data)' }, 400);
    }

    // Convert to data URL
    const ab = await pdf.arrayBuffer();
    const base64 = Buffer.from(ab).toString('base64');
    const mediaType = pdf.type || 'application/pdf';
    const dataUrl = `data:${mediaType};base64,${base64}`;

    if (!Bun.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is not set');
      return c.json({ error: 'Model for PDF input not configured' }, 500);
    }

    const result = await generateObject({
      model: openai('gpt-4o-mini'),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'file', data: dataUrl, mediaType },
          ],
        },
      ],
      schema: z.object({ summary: z.string().describe('Concise summary of the PDF.') }),
    });

    return c.json(result.object);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return c.json({ error: 'Failed to analyze PDF' }, 500);
  }
});

// Serve uploaded files for tool access
router.get('/uploads/:id', (c) => {
  const id = c.req.param('id');
  const rec = uploadStore.get(id);
  if (!rec) return c.json({ error: 'Not found' }, 404);
  return new Response(rec.bytes, {
    status: 200,
    headers: {
      'Content-Type': rec.contentType,
      'Content-Disposition': `inline; filename="${rec.filename}"`,
      'Cache-Control': 'no-store',
    },
  });
});

// POST /api/ai/embeddings
// Body: { input: string }
router.post('/embeddings', async (c) => {
  try {
    const body = await c.req.json();
    const input: string = body?.input ?? '';
    if (!input) {
      return c.json({ error: 'input is required' }, 400);
    }

    const modelName = Bun.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
    const { embedding } = await embed({
      model: googleAI.embedding(modelName),
      value: input,
    });

    return c.json({ embedding });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return c.json({ error: 'Failed to generate embedding' }, 500);
  }
});

// POST /api/ai/pdf/highlight
// Accepts multipart/form-data with fields:
// - file: PDF file (required)
// - boxes: JSON string of highlight boxes: [{ page: number, x: number, y: number, width: number, height: number }]
//   Coordinates are in PDF points with origin at bottom-left. If you want top-left origin, set topLeft=true.
// - topLeft: '1' | 'true' to interpret y from top-left (optional)
// - normalize: '1' | 'true' to treat x,y,width,height as percentages [0..1] (optional)
// Returns: application/pdf with highlighted rectangles drawn.
router.post('/pdf/highlight', async (c) => {
  try {
    const form = await c.req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return c.json({ error: 'file is required (multipart/form-data)' }, 400);
    }

    const boxesRaw = form.get('boxes');
    let boxes: { page: number; x: number; y: number; width: number; height: number }[] = [];
    if (typeof boxesRaw === 'string' && boxesRaw.trim()) {
      try {
        boxes = JSON.parse(boxesRaw);
        if (!Array.isArray(boxes)) boxes = [];
      } catch (_e) {
        return c.json({ error: 'boxes must be a valid JSON array' }, 400);
      }
    }

    const topLeftFlag = String(form.get('topLeft') ?? '').toLowerCase();
    const topLeft = topLeftFlag === '1' || topLeftFlag === 'true';
    const normalizeFlag = String(form.get('normalize') ?? '').toLowerCase();
    const normalize = normalizeFlag === '1' || normalizeFlag === 'true';

    const arrBuf = await file.arrayBuffer();
    const inputPdfBytes = new Uint8Array(arrBuf);
    const pdfDoc = await PDFDocument.load(inputPdfBytes);

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

      // Convert from top-left origin to PDF bottom-left if requested
      if (topLeft) {
        y = ph - y - h;
      }

      // Draw a semi-transparent yellow rectangle as the highlight overlay
      page.drawRectangle({
        x,
        y,
        width: w,
        height: h,
        color: rgb(1, 1, 0),
        opacity: 0.35,
        borderColor: rgb(1, 1, 0),
        borderOpacity: 0.35,
      });
    }

    const outBytes = await pdfDoc.save();
    return new Response(outBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="highlighted.pdf"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return c.json({ error: 'Failed to highlight PDF' }, 500);
  }
});

export const aiRoutes = router;

