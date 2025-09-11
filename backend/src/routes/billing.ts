import { Hono } from 'hono';
import { auth } from '@auth/index';
import { stripeClient } from '@lib/stripe/client';

const SEAT_PRICE_ID = Bun.env.STRIPE_SEAT_PRICE_ID;
const PAGE_PRICE_ID = Bun.env.STRIPE_PAGE_PRICE_ID;

if (!SEAT_PRICE_ID) {
  console.warn('STRIPE_SEAT_PRICE_ID is not set. Seat adjustment endpoints will not work properly.');
}
if (!PAGE_PRICE_ID) {
  console.warn('STRIPE_PAGE_PRICE_ID is not set. Page usage endpoint will not work properly.');
}

const router = new Hono();

async function getActiveStripeSubscriptionId(referenceId: string, headers: Headers): Promise<string | null> {
  // Use Better Auth server API to find active subscription for this reference
  const res = await auth.api.listActiveSubscriptions({
    query: { referenceId },
    headers,
  });
  // listActiveSubscriptions returns array; pick active/trialing
  const subs = Array.isArray((res as any)?.data) ? (res as any).data : [];
  const active = subs.find((s: any) => s.status === 'active' || s.status === 'trialing') || subs[0];
  return active?.stripeSubscriptionId ?? null;
}

// Increment seats by 1 for the org/user reference
router.post('/seat/increment', async (c) => {
  try {
    const { referenceId } = await c.req.json();
    if (!referenceId) return c.json({ error: 'referenceId is required' }, 400);
    if (!SEAT_PRICE_ID) return c.json({ error: 'Seat price not configured' }, 500);

    const subscriptionId = await getActiveStripeSubscriptionId(referenceId, c.req.raw.headers);
    if (!subscriptionId) return c.json({ error: 'No active subscription found' }, 404);

    const sub = await stripeClient.subscriptions.retrieve(subscriptionId);
    let seatItem = sub.items.data.find((it) => it.price.id === SEAT_PRICE_ID);

    if (!seatItem) {
      // Add a seat item starting at quantity 1
      const updated = await stripeClient.subscriptions.update(subscriptionId, {
        items: [{ price: SEAT_PRICE_ID, quantity: 1 }],
        expand: ['items.data']
      });
      seatItem = updated.items.data.find((it) => it.price.id === SEAT_PRICE_ID) || undefined;
    } else {
      // Increment quantity by 1
      await stripeClient.subscriptionItems.update(seatItem.id, {
        quantity: (seatItem.quantity || 0) + 1,
        proration_behavior: 'create_prorations',
      });
    }

    return c.json({ ok: true });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return c.json({ error: 'Failed to increment seats' }, 500);
  }
});

// Decrement seats by 1 for the org/user reference
router.post('/seat/decrement', async (c) => {
  try {
    const { referenceId } = await c.req.json();
    if (!referenceId) return c.json({ error: 'referenceId is required' }, 400);
    if (!SEAT_PRICE_ID) return c.json({ error: 'Seat price not configured' }, 500);

    const subscriptionId = await getActiveStripeSubscriptionId(referenceId, c.req.raw.headers);
    if (!subscriptionId) return c.json({ error: 'No active subscription found' }, 404);

    const sub = await stripeClient.subscriptions.retrieve(subscriptionId);
    const seatItem = sub.items.data.find((it) => it.price.id === SEAT_PRICE_ID);
    if (!seatItem) return c.json({ error: 'Seat item not found on subscription' }, 400);

    const currentQty = seatItem.quantity || 0;
    const newQty = Math.max(0, currentQty - 1);
    await stripeClient.subscriptionItems.update(seatItem.id, {
      quantity: newQty,
      proration_behavior: 'create_prorations',
    });

    return c.json({ ok: true });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return c.json({ error: 'Failed to decrement seats' }, 500);
  }
});

// Report page usage (metered billing) for the org/user reference
router.post('/usage/pages', async (c) => {
  try {
    const { referenceId, count } = await c.req.json();
    const qty = Number(count || 0);
    if (!referenceId) return c.json({ error: 'referenceId is required' }, 400);
    if (!PAGE_PRICE_ID) return c.json({ error: 'Page price not configured' }, 500);
    if (!qty || qty < 0) return c.json({ error: 'count must be > 0' }, 400);

    const subscriptionId = await getActiveStripeSubscriptionId(referenceId, c.req.raw.headers);
    if (!subscriptionId) return c.json({ error: 'No active subscription found' }, 404);

    const sub = await stripeClient.subscriptions.retrieve(subscriptionId);
    let pageItem = sub.items.data.find((it) => it.price.id === PAGE_PRICE_ID);

    if (!pageItem) {
      const updated = await stripeClient.subscriptions.update(subscriptionId, {
        items: [{
          price: PAGE_PRICE_ID,
          // For metered price, quantity is ignored; usage is reported separately
        }],
        expand: ['items.data'],
      });
      pageItem = updated.items.data.find((it) => it.price.id === PAGE_PRICE_ID) || undefined;
      if (!pageItem) return c.json({ error: 'Failed to attach metered page item' }, 500);
    }

    await stripeClient.subscriptionItems.createUsageRecord(pageItem.id, {
      quantity: qty,
      action: 'increment',
      timestamp: Math.floor(Date.now() / 1000),
    });

    return c.json({ ok: true });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return c.json({ error: 'Failed to record page usage' }, 500);
  }
});

export default router;

