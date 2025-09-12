import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization } from 'better-auth/plugins';
import { stripe as stripePlugin } from '@better-auth/stripe';
import type { Context } from 'hono';

import { db } from '@db/client';
import { sendEmail } from '@lib/email/resend';
import { stripeClient, stripeWebhookSecret } from '@lib/stripe/client';

const authSecret = Bun.env.AUTH_SECRET;
if (!authSecret) {
  throw new Error('AUTH_SECRET is not set');
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  secret: authSecret,
  emailAndPassword: {
    enabled: true,
    async sendResetPassword({ user, url /*, token*/ }, _request) {
      try {
        await sendEmail({
          to: user.email,
          subject: 'Reset your password',
          text: `Click the link to reset your password: ${url}`,
          html: `<p>Click <a href="${url}">here</a> to reset your password.</p>`,
        });
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
      }
    },
  },
  emailVerification: {
    async sendVerificationEmail({ user, url }, _request) {
      try {
        await sendEmail({
          to: user.email,
          subject: 'Verify your email',
          text: `Verify your email by opening: ${url}`,
          html: `<p>Verify your email by clicking <a href="${url}">this link</a>.</p>`,
        });
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
      }
    },
  },
  plugins: [
    organization({
      teams: {
        enabled: true,
      },
    }),
    stripePlugin({
      stripeClient,
      stripeWebhookSecret,
      createCustomerOnSignUp: true,
      subscription: {
        enabled: true,
        plans: [
          // Add your actual Stripe price IDs here
          // { name: 'basic', priceId: 'price_...', limits: { projects: 5, storage: 10 } },
          // { name: 'pro', priceId: 'price_...', limits: { projects: 20, storage: 50 }, freeTrial: { days: 14 } },
        ],
        // Example for org subscriptions authorization
        // authorizeReference: async ({ user, referenceId, action }) => {
        //   // TODO: Check the user's role in the organization identified by referenceId
        //   // return true only if user can manage billing for that org (e.g., owner/admin)
        //   return true;
        // },
      },
    }),
  ],
});

// Optional helper to attach session/user to Hono context variables
export async function attachSession(c: Context, next: () => Promise<void>) {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    // @ts-ignore - augmenting at runtime; define proper types later if needed
    c.set('user', session?.user ?? null);
    // @ts-ignore
    c.set('session', session?.session ?? null);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    // still continue so public routes can work
  }
  await next();
}

