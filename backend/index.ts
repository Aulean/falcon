import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { aiRoutes } from './src/routes/ai';
import billingRoutes from './src/routes/billing';
import { auth, attachSession } from './src/auth';

const app = new Hono();

// CORS (tune origins as needed)
app.use('*', cors());

// Optional: attach session/user to context
app.use('*', attachSession);

// Health check
app.get('/health', (c) => c.json({ ok: true }));

// Better Auth handler mounted at /api/auth/* (GET and POST)
app.on(['POST', 'GET'], '/api/auth/*', (c) => {
  try {
    return auth.handler(c.req.raw);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return c.json({ error: 'Auth handler error' }, 500);
  }
});

// AI routes mounted at /api/ai
app.route('/api/ai', aiRoutes);

// Billing routes mounted at /api/billing (seat management & usage)
app.route('/api/billing', billingRoutes);

// Global error handler - log only error.message
app.onError((err, c) => {
  console.error(err instanceof Error ? err.message : String(err));
  return c.json({ error: 'Internal Server Error' }, 500);
});

// 404 handler
app.notFound((c) => c.json({ error: 'Not Found' }, 404));

export default app;
