import { Resend } from 'resend';

const apiKey = Bun.env.RESEND_API_KEY;
const mailFromEnv = Bun.env.MAIL_FROM;

if (!apiKey) {
  throw new Error('RESEND_API_KEY is not set');
}
if (!mailFromEnv) {
  throw new Error('MAIL_FROM is not set');
}

// After the guard, treat as non-optional string
const FROM: string = mailFromEnv;

export const resend = new Resend(apiKey);

export async function sendEmail(opts: { to: string; subject: string; html?: string; text?: string }) {
  const { to, subject, html, text } = opts;
  const resp = await resend.emails.send({
    from: FROM,
    to,
    subject,
    html,
    text,
    react: undefined,
  });
  const err = (resp as any)?.error;
  if (err) {
    // Only log error message
    console.error(typeof err === 'string' ? err : err?.message || 'Email send failed');
  }
  return resp;
}

