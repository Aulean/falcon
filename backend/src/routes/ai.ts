import { Hono } from 'hono';
import { streamText, embed, tool, generateObject, convertToModelMessages } from 'ai';
import { z } from 'zod';
import { azure } from '@lib/ai/azure';
import { googleAI } from '@lib/ai/google';
import { openai } from '@ai-sdk/openai';
import { PDFDocument, rgb } from 'pdf-lib';
import { highlightPdf } from '@lib/pdf/highlight';
import { extractPdfText } from '@lib/pdf/text';

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
        .optional()
        .describe(
          'Optional list of rectangles to highlight. If omitted or empty, a default highlight is added near the top area of page 1. Coordinates in PDF points from bottom-left unless topLeft=true. If normalize=true, treat values as percentages [0..1].',
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
            const firstFile = uploadedFiles[0];
            if (!firstFile) {
              throw new Error('No uploaded file found');
            }
            inputBytes = Buffer.from(firstFile.base64, 'base64');
          } else {
            throw new Error('Either fileUrl or fileBase64 must be provided');
          }

          // Default highlight box if none provided
          const needsDefault = !boxes || boxes.length === 0;
          const defaultBoxes = [
            // normalized coords relative to top-left
            { page: 0, x: 0.1, y: 0.1, width: 0.3, height: 0.06 },
          ];
          const boxesToUse = needsDefault ? defaultBoxes : boxes!;
          const topLeftToUse = needsDefault ? true : topLeft;
          const normalizeToUse = needsDefault ? true : normalize;

          const out = await highlightPdf(inputBytes, boxesToUse, { topLeft: topLeftToUse, normalize: normalizeToUse });
          const id = crypto.randomUUID();
          uploadStore.set(id, { bytes: out, contentType: 'application/pdf', filename: 'highlighted.pdf' });
          const url = `${baseOrigin}/api/ai/uploads/${id}`;
          console.log('[tool:highlightPdf] generated highlighted PDF at', url, 'bytes:', out.length);
          // Return a short string so the model can include it in the reply.
          return `I generated a highlighted PDF${needsDefault ? ' with a default highlight' : ''}. Download it here: ${url}`;
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

// Simple proxy to bypass remote CORS when loading PDFs in the browser
// GET /api/ai/proxy?url=ENCODED_URL
router.get('/proxy', async (c) => {
  try {
    const url = String(c.req.query('url') ?? '')
    if (!url) return c.json({ error: 'url is required' }, 400)
    const resp = await fetch(url)
    const ab = await resp.arrayBuffer()
    const ct = resp.headers.get('content-type') || 'application/octet-stream'
    return new Response(ab, {
      status: resp.status,
      headers: {
        'Content-Type': ct,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    return c.json({ error: 'Proxy failed' }, 500)
  }
})

// POST /api/ai/pdf/positions
// Accepts either JSON or multipart/form-data:
// JSON: { url?: string, phrases?: string[], caseSensitive?: boolean, wholeWord?: boolean }
// multipart: file + phrases (JSON array string)
// Returns: { boxes: [{ page, x, y, w, h }], normalize: true, topLeft: true }
router.post('/pdf/positions', async (c) => {
  try {
    const ct = c.req.header('content-type')?.toLowerCase() || ''
    let bytes: Uint8Array | null = null
    let phrases: string[] = []
    let caseSensitive = false
    let wholeWord = false

    if (ct.includes('multipart/form-data')) {
      const form = await c.req.formData()
      const f = form.get('file')
      if (f instanceof File) {
        bytes = new Uint8Array(await f.arrayBuffer())
      }
      const p = form.get('phrases')
      if (typeof p === 'string' && p.trim()) {
        try { phrases = JSON.parse(p) } catch { phrases = [] }
      }
      caseSensitive = String(form.get('caseSensitive') ?? '').toLowerCase() === 'true'
      wholeWord = String(form.get('wholeWord') ?? '').toLowerCase() === 'true'
    } else if (ct.includes('application/json')) {
      const body = await c.req.json()
      const url = String(body?.url ?? '')
      phrases = Array.isArray(body?.phrases) ? body.phrases.map((s: any) => String(s)) : []
      caseSensitive = Boolean(body?.caseSensitive)
      wholeWord = Boolean(body?.wholeWord)
      if (url) {
        const resp = await fetch(url)
        if (!resp.ok) return c.json({ error: 'failed to fetch url' }, 400)
        const ab = await resp.arrayBuffer()
        bytes = new Uint8Array(ab)
      }
    }

    if (!bytes) return c.json({ error: 'No PDF provided' }, 400)
    if (!phrases.length) return c.json({ boxes: [], normalize: true, topLeft: true })

    const { findTextPositions } = await import('@lib/pdf/positions')
    const { boxes } = await findTextPositions(bytes, phrases, { caseSensitive, wholeWord })

    return c.json({ boxes, normalize: true, topLeft: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[positions] error:', msg)
    return c.json({ error: 'Failed to compute positions', message: msg }, 500)
  }
})

// POST /api/ai/pdf/highlight
// Accepts multipart/form-data with fields:
// - file: PDF file (required)
// - boxes: JSON string of highlight boxes: [{ page: number, x: number, y: number, width: number, height: number }]
//   Coordinates are in PDF points with origin at bottom-left. If you want top-left origin, set topLeft=true.
// - topLeft: '1' | 'true' to interpret y from top-left (optional)
// - normalize: '1' | 'true' to treat x,y,width,height as percentages [0..1] (optional)
// Returns: application/pdf with highlighted rectangles drawn.
// POST /api/ai/pdf/find
// JSON: { url?: string, prompt: string }
// multipart: file + prompt
// Response: { phrases: string[], caseSensitive?: boolean, wholeWord?: boolean }
router.post('/pdf/find', async (c) => {
  try {
    const ct = c.req.header('content-type')?.toLowerCase() || ''
    let prompt = ''
    let bytes: Uint8Array | null = null
    if (ct.includes('multipart/form-data')) {
      const form = await c.req.formData()
      const f = form.get('file')
      if (f instanceof File) {
        bytes = new Uint8Array(await f.arrayBuffer())
      }
      prompt = String(form.get('prompt') ?? '')
    } else if (ct.includes('application/json')) {
      const body = await c.req.json()
      prompt = String(body?.prompt ?? '')
      const url = String(body?.url ?? '')
      if (url) {
        const resp = await fetch(url)
        if (!resp.ok) return c.json({ error: 'failed to fetch url' }, 400)
        const ab = await resp.arrayBuffer()
        bytes = new Uint8Array(ab)
      }
    }

    const InputSchema = z.object({ prompt: z.string().min(4) })
    const parsed = InputSchema.safeParse({ prompt })
    if (!parsed.success) return c.json({ error: 'invalid input' }, 400)
    if (!bytes) return c.json({ error: 'No PDF provided' }, 400)

    const OutputSchema = z.object({
      phrases: z.array(z.string().min(1)).min(1),
      caseSensitive: z.boolean().optional().default(false),
      wholeWord: z.boolean().optional().default(false),
    })

    const hasOpenAI = Boolean(Bun.env.OPENAI_API_KEY)

    let payload: { phrases: string[]; caseSensitive?: boolean; wholeWord?: boolean }

    if (hasOpenAI) {
      // Use file input with OpenAI 4o-mini for best results
      const base64 = Buffer.from(bytes).toString('base64')
      const dataUrl = `data:application/pdf;base64,${base64}`
      const system = `You find short literal phrases inside a PDF. Return only JSON matching { phrases: string[]; caseSensitive?: boolean; wholeWord?: boolean }.
- Phrases must literally occur in the provided PDF. Keep them 1-5 words when possible. No regex.`
      const result = await generateObject({
        model: openai('gpt-4o-mini'),
        schema: OutputSchema,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: system + `\n\nUser request: ${prompt}` },
              { type: 'file', data: dataUrl, mediaType: 'application/pdf' },
            ],
          },
        ],
      })
      const validated = OutputSchema.safeParse(result.object)
      if (!validated.success) return c.json({ error: 'model output validation failed' }, 500)
      payload = validated.data
    } else {
      // Fallback: extract text and use Azure (or any configured text model) with JSON schema
      const text = await extractPdfText(bytes, 18000)
      const system = `You help users locate relevant phrases inside a PDF. Given the user's request and the document text, return short literal phrases that appear in the PDF which, when highlighted, answer the user's request. Output only JSON matching this TypeScript type:\n{ phrases: string[]; caseSensitive?: boolean; wholeWord?: boolean }\n- Keep phrases short, ideally 1-5 words, and ensure they literally occur in the text.\n- Prefer fewer phrases that best satisfy the request.\n- Do not include regex or special characters. Use literal text.`
      const result = await generateObject({
        model: azure('gpt-5-mini'),
        schema: OutputSchema,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `User request: ${prompt}\n\nDocument text (truncated):\n${text}` },
        ],
      })
      const validated = OutputSchema.safeParse(result.object)
      if (!validated.success) return c.json({ error: 'model output validation failed' }, 500)
      payload = validated.data
    }

    return c.json(payload)
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    return c.json({ error: 'Failed to find phrases' }, 500)
  }
})

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

