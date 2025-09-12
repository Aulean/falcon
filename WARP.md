# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

Project overview
- Monorepo with two apps at the root:
  - frontend: React 19 + Vite + TypeScript + Tailwind v4 + TanStack Router (with router codegen)
  - backend: Bun runtime + Hono web framework + Better Auth (+ Stripe plugin) + Drizzle ORM (Postgres) + Vercel AI SDK (Azure OpenAI + Google embeddings) + pdf-lib
- Package manager: bun (bun.lock present in both apps)
- Rule (from backend README): do not start dev servers unless explicitly requested. Error logging should log only error.message.

Quickstart commands (run in the respective subfolder)
- Initial install
  ```bash path=null start=null
  bun install
  ```

- Frontend (C:\Users\alvar\Downloads\aulean\falcon\frontend)
  ```bash path=null start=null
  # Lint
  bun run lint

  # Build
  bun run build

  # Preview built app (static dev preview)
  bun run preview

  # Dev server (only run if the user explicitly asks you to)
  bun run dev
  ```

- Backend (C:\Users\alvar\Downloads\aulean\falcon\backend)
  ```bash path=null start=null
  # Type-check
  bun run typecheck

  # Start (prod-like, runs index.ts)
  bun run start

  # Dev (watch mode) — only run if explicitly asked
  bun run dev

  # Database (Drizzle)
  bun run db:generate
  bun run db:migrate

  # Build (note: script targets ./src/server.ts which is not in repo; see Caveats)
  bun run build
  ```

- Tests
  ```bash path=null start=null
  # No test runner is configured in frontend or backend. There are no test scripts.
  # If tests are added later:
  # - Bun: bun test path/to/file.test.ts -t "pattern"
  # - Vitest: bunx vitest run -t "pattern"
  ```

Environment and external services (from backend/README.md)
- Copy backend/.env.example to backend/.env and set:
  - DATABASE_URL
  - AUTH_SECRET
  - Azure OpenAI: AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT_NAME=gpt-5-mini, AZURE_OPENAI_API_VERSION
  - Google Generative AI: GOOGLE_GENERATIVE_AI_API_KEY, GEMINI_EMBEDDING_MODEL=gemini-embedding-001
  - Email (Resend): RESEND_API_KEY, MAIL_FROM (e.g. "Your App <no-reply@your-domain.com>")
  - Stripe: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_SEAT_PRICE_ID, STRIPE_PAGE_PRICE_ID
- Stripe webhook: configure POST /api/auth/stripe/webhook in Stripe Dashboard with the above secret.

High-level architecture
- Frontend (React + Vite)
  - Entry: src/main.tsx creates TanStack Router with generated routeTree (src/routeTree.gen.ts).
  - Routing: file-based routes in src/routes with TanStack Router plugin generating the tree. Root layout in src/routes/__root.tsx provides sidebar layout, session-id-in-URL behavior, and header actions.
  - Aliases: vite.config.ts maps @ -> ./src. TypeScript paths mirror this in tsconfig.*.
  - UI: Tailwind v4 via @tailwindcss/vite; component primitives live under src/components/ui; app shell in src/components/app-sidebar and navigation components.

- Backend (Bun + Hono)
  - Entry: backend/index.ts sets up Hono app with CORS, optional session attachment, error and 404 handlers, and mounts feature routers:
    - Auth: Better Auth handler mounted on /api/auth/* (GET/POST) with Stripe plugin integration (customer creation + webhook). Helper middleware attachSession fetches user/session via auth.api.getSession and sets it on context.
    - AI: src/routes/ai.ts under /api/ai with endpoints:
      - POST /api/ai/chat — streams responses via Vercel AI SDK with a tool for PDF highlighting. Accepts JSON or multipart with uploaded files. Uses Azure OpenAI model (gpt-5-mini) by default.
      - POST /api/ai/upload — temporary upload to an in-memory store; returns a URL used by tools.
      - GET  /api/ai/uploads/:id — serves previously uploaded bytes from memory.
      - POST /api/ai/analyze — accepts a PDF (multipart) and prompt; uses OpenAI (gpt-4o-mini) to return a structured summary.
      - POST /api/ai/embeddings — returns a single embedding using Google Gemini embedding model.
      - POST /api/ai/pdf/highlight — returns a new PDF with highlighted rectangles using pdf-lib; supports top-left or normalized boxes.
      - Note: upload storage is an in-memory Map, suitable for development only.
    - Billing: src/routes/billing.ts under /api/billing with Stripe-backed endpoints:
      - POST /api/billing/seat/increment|decrement — adjusts seat quantity for the active subscription identified by referenceId.
      - POST /api/billing/usage/pages — records metered page usage against the active subscription.
  - Auth: better-auth configured with drizzle adapter (Postgres), email/password auth, email verification and reset via Resend, and Stripe plugin. Only error.message is logged on failures (matching the user preference to avoid noisy payloads).
  - Database: src/db/client.ts creates a shared postgres-js client and a Drizzle instance. drizzle.config.ts points schema to ./src/db/schema.ts and outputs migrations to ./drizzle.
  - AI model providers:
    - Azure OpenAI: backend/src/lib/ai/azure.ts exposes azure(...) and azureModelFromEnv(). Requires AZURE_OPENAI_* env.
    - Google Generative AI: backend/src/lib/ai/google.ts for embeddings; requires GOOGLE_GENERATIVE_AI_API_KEY.
  - Stripe: backend/src/lib/stripe/client.ts constructs a versioned Stripe client; webhook secret and API key are required at startup.

Conventions and rules observed in repo
- Do not start dev servers unless explicitly requested.
- Log only error.message for errors (avoid logging full error objects).
- Path aliases (backend tsconfig.json):
  - @routes/* -> src/routes/*
  - @auth/*   -> src/auth/*
  - @db/*     -> src/db/*
  - @lib/*    -> src/lib/*

Caveats and gotchas
- Backend build script references ./src/server.ts but that file is not present. Building with bun run build will fail unless server.ts is added or the script is corrected (e.g., to build index.ts or the actual server entry).
- The in-memory upload store in /api/ai is ephemeral and cleared on process restart; it’s intended for development.

