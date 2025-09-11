# Backend (Bun + Hono + Drizzle + Better Auth + Vercel AI SDK)

Stack
- Runtime: Bun
- Web framework: Hono
- Auth: Better Auth (email/password enabled, organizations plugin)
- DB: Postgres (via postgres-js and Drizzle ORM)
- AI: Vercel AI SDK
  - Chat: Azure OpenAI (deployment: gpt-5-mini)
  - Embeddings: Google Gemini (gemini-embedding-001)

Environment
Copy .env.example to .env and set real values:
- DATABASE_URL
- AUTH_SECRET
- AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT_NAME=gpt-5-mini, AZURE_OPENAI_API_VERSION
- GOOGLE_GENERATIVE_AI_API_KEY, GEMINI_EMBEDDING_MODEL=gemini-embedding-001
- RESEND_API_KEY, MAIL_FROM (e.g., "Your App <no-reply@your-domain.com>")
- STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
- STRIPE_SEAT_PRICE_ID (recurring seat price), STRIPE_PAGE_PRICE_ID (metered per-page price)

Scripts
- bun run typecheck
- bun run db:generate (requires a schema; skip if you don’t have custom tables yet)
- bun run db:migrate (applies Drizzle migrations; skip if you don’t have custom tables yet)
- bun run build (produces dist/server.js)

Notes
- Do not start the dev server unless explicitly requested.
- Error logging: only log error.message (no full error objects).
- Better Auth routes are mounted at /api/auth/* (GET/POST). Webhooks for Stripe will hit POST /api/auth/stripe/webhook.
- Configure Stripe dashboard webhook endpoint to https://your-domain.com/api/auth/stripe/webhook and set STRIPE_WEBHOOK_SECRET accordingly. Select events: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted.
- AI endpoints:
  - POST /api/ai/chat { messages: [{role, content}] }
  - POST /api/ai/embeddings { input }
