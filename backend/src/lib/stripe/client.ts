import Stripe from 'stripe';

const stripeSecret = Bun.env.STRIPE_SECRET_KEY;
export const stripeWebhookSecret = Bun.env.STRIPE_WEBHOOK_SECRET!;

if (!stripeSecret) {
  throw new Error('STRIPE_SECRET_KEY is not set');
}
if (!stripeWebhookSecret) {
  throw new Error('STRIPE_WEBHOOK_SECRET is not set');
}

export const stripeClient = new Stripe(stripeSecret, {
  apiVersion: '2025-08-27.basil',
});

