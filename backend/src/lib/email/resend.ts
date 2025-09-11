import { Resend } from 'resend';

const apiKey = Bun.env.RESEND_API_KEY;
const from = Bun.env.MAIL_FROM;

if (!apiKey) {
  throw new Error('RESEND_API_KEY is not set');
}
if (!from) {
  throw new Error('MAIL_FROM is not set');
}

export const resend = new Resend(apiKey);

export async function sendEmail(opts: { to: string; subject: string; html?: string; text?: string }) {
  const { to, subject, html, text } = opts;
  const resp = await resend.emails.send({
    from,
    to,
    subject,
    html,
    text,
  });
  if (resp.error) {
    // Only log error message
    console.error(typeof resp.error === 'string' ? resp.error : (resp.error as any)?.message || 'Email send failed');
  }
  return resp;
}

