# Unique AI Frontdesk

Multi-tenant AI receptionist SaaS for coaching institutes — website chat, WhatsApp, voice calls, lead CRM,
demo-class booking and human handoff, built to the **Unique AI Frontdesk PRD v1.0**.

- **Frontend:** React 18 + Vite + Tailwind CSS + React Router + Axios + React Hook Form + Recharts + Lucide
- **Backend:** Node.js + Express + Mongoose + JWT + bcryptjs + Zod + Helmet + express-rate-limit
- **AI:** OpenAI chat completions with tenant-scoped retrieval (RAG) and a grounded fallback when no key is set
- **Channels:** Website widget API, WhatsApp Cloud API webhook, Twilio-compatible voice webhooks
- **Hosting:** Vercel (static client + serverless Express function), MongoDB Atlas

## Quick start

```bash
npm install
cp .env.example .env          # then set MONGODB_URI and the JWT secrets

npm run seed                  # plans + demo workspace + demo logins
npm run dev                   # API on http://localhost:5000
npm run dev:client            # dashboard on http://localhost:5173 (proxies /api)
```

Demo logins created by `npm run seed`:

| Role | Email | Password |
| --- | --- | --- |
| Super Admin | admin@uniqueit.in | Admin@12345 |
| Business Admin | owner@uniquecomputers.in | Owner@12345 |
| Staff | staff@uniquecomputers.in | Staff@12345 |
| Second tenant admin | owner@abccoaching.in | Owner@12345 |

Without a MongoDB instance you can run a throwaway in-memory database:

```bash
USE_IN_MEMORY_DB=1 npm run dev      # downloads a MongoDB binary on first run
USE_IN_MEMORY_DB=1 npm run seed
```

For a persistent local database with extra dummy data (40 leads, 10 chats, 6 demo appointments and a QA login):

```bash
npm run db:local                    # mongod on 127.0.0.1:27017, data in .mongo-data/
npm run seed
npm run demo:data                   # safe to re-run, never duplicates
```

`demo:data` prints the logins it uses. Besides the demo accounts above it creates
`tester@uniquecomputers.in / Tester@12345` (business admin) so testers can work without the owner account.

## Features implemented

| PRD module | Where |
| --- | --- |
| Authentication, refresh rotation, password reset, RBAC | `server/src/routes/auth.routes.js`, `middleware/auth.js`, `middleware/rbac.js` |
| Tenant management + tenant isolation (server-derived `tenantId`, cross-tenant attempts audited) | `routes/tenants.routes.js`, `middleware/rbac.js` |
| Business profile + coaching courses/fees/batches | `routes/business.routes.js`, `models/BusinessProfile.js` |
| AI receptionist agents + playground | `routes/agents.routes.js` |
| Knowledge base with PDF/TXT/MD/CSV ingestion and chunking | `routes/knowledge.routes.js`, `services/retrieval.js` |
| Website chatbot + embeddable widget | `routes/public.routes.js`, `pages/PublicChat.jsx` |
| WhatsApp Cloud API webhook (signature verified) | `routes/whatsapp.routes.js` |
| Voice receptionist webhooks (Twilio signature, TwiML, transcripts) | `routes/voice.routes.js` |
| Lead CRM, dedupe, assignment, notes, CSV export | `routes/leads.routes.js`, `services/crm.js` |
| Customers with history | `routes/customers.routes.js` |
| Appointments, availability, double-booking prevention | `routes/appointments.routes.js`, `services/booking.js` |
| Conversations + human handoff / resume / close | `routes/conversations.routes.js`, `services/chat.js` |
| Notifications | `routes/notifications.routes.js` |
| Reports (business) and platform analytics | `routes/analytics.routes.js` |
| Subscription plans, usage metering, invoices | `routes/plans.routes.js`, `services/usage.js` |
| Audit logs, integrations, platform settings | `routes/audit.routes.js`, `routes/integrations.routes.js`, `routes/platform.routes.js` |

## AI grounding rules

`services/ai.js` enforces, in the system prompt and in code:

1. Answers come only from the business profile and enabled knowledge entries.
2. Unknown questions set `escalate: true` instead of inventing fees, availability or policies.
3. Appointments are only confirmed after `services/booking.js` successfully saves the booking.
4. If `OPENAI_API_KEY` is missing or the provider fails, a deterministic retrieval-only fallback answers and
   escalates when nothing relevant is found.

## API

Every response uses one envelope: `{ "success": true, "data": ..., "meta": ... }` or
`{ "success": false, "error": { "code", "message", "details?" } }`.

```
POST   /api/auth/register | login | logout | refresh | forgot-password | reset-password
GET    /api/auth/me                     PATCH /api/auth/me
POST   /api/auth/change-password

GET    /api/tenants  POST /api/tenants  GET|PUT /api/tenants/:id
PATCH  /api/tenants/:id/status

GET    /api/users    POST /api/users    GET|PUT|DELETE /api/users/:id
GET    /api/business/profile            PUT /api/business/profile

GET    /api/ai-agents  POST /api/ai-agents  PUT|DELETE /api/ai-agents/:id
POST   /api/ai-agents/:id/test

GET    /api/knowledge  POST /api/knowledge  PUT|DELETE /api/knowledge/:id
POST   /api/knowledge/upload            GET /api/knowledge/documents

GET    /api/leads  POST /api/leads  GET|PUT|DELETE /api/leads/:id
PATCH  /api/leads/:id/status            POST /api/leads/:id/assign | notes
GET    /api/leads/export

GET    /api/customers  POST /api/customers  GET|PUT|DELETE /api/customers/:id
GET    /api/appointments  POST /api/appointments  PUT /api/appointments/:id
PATCH  /api/appointments/:id/status     GET /api/appointments/availability

GET    /api/conversations  GET /api/conversations/:id
POST   /api/conversations/:id/reply     PATCH /api/conversations/:id/handoff
PATCH  /api/conversations/:id/resume-ai PATCH /api/conversations/:id/close
GET    /api/calls

POST   /api/voice/incoming | gather | status | transfer
GET    /api/webhooks/whatsapp           POST /api/webhooks/whatsapp
GET    /api/public/widget/:slug/config  POST /api/public/widget/:slug/chat
GET    /api/public/widget/:slug/messages
GET    /api/public/widget/:slug/availability
POST   /api/public/widget/:slug/appointments
GET    /api/public/widget/:slug/embed.js

GET    /api/plans  POST /api/plans  PUT /api/plans/:id
GET    /api/subscriptions/me  POST /api/subscriptions/change-plan
GET    /api/subscriptions/invoices

GET    /api/analytics/business/overview GET /api/analytics/platform/overview
GET    /api/notifications               GET /api/notifications/unread-count
PATCH  /api/notifications/:id/read      POST /api/notifications/read-all
GET    /api/audit | /api/audit/tenant
GET    /api/integrations                PUT /api/integrations/:provider
POST   /api/integrations/:provider/check
GET    /api/platform/users              PATCH /api/platform/users/:id/status
GET    /api/platform/settings           PUT /api/platform/settings
GET    /api/health
```

## Security notes

- Access tokens are short-lived JWTs; refresh tokens are opaque, hashed at rest, rotated on use and revocable.
- `tenantId` is always derived from the authenticated user; a client-supplied `X-Tenant-Id` that differs is
  rejected with 403 and written to the audit log.
- Passwords use bcrypt (cost 12). Super Admins cannot self-register; see `POST /api/auth/bootstrap-super-admin`
  (disabled unless `ALLOW_SUPER_ADMIN_BOOTSTRAP=true`).
- WhatsApp and Twilio webhooks verify provider signatures; in production unsigned webhooks are rejected.
- Provider credentials are stored per tenant and masked in API responses.

## Deployment on Vercel

`vercel.json` builds the Vite client and exposes the Express app as a serverless function at `api/index.js`.

1. Push this repository to GitHub.
2. Import it in Vercel (framework preset: **Other**). Build command and output directory come from `vercel.json`.
3. Add environment variables in **Project → Settings → Environment Variables**:
   `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CLIENT_ORIGIN` (your Vercel URL), and optionally
   `OPENAI_API_KEY`, `OPENAI_MODEL`, `TWILIO_AUTH_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`.
4. Deploy, then seed the production database once from your machine:
   `MONGODB_URI="<atlas-uri>" npm run seed`
5. Open the deployment URL and sign in with a demo account, or register a new business.

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### One-command deploy (`npm run deploy`)

Steps 2–5 above can be done in a single command. Put the Atlas URI and both JWT secrets in `.env`, save a Vercel
token (https://vercel.com/account/tokens) in `deploy-token.txt` (gitignored), then run:

```bash
npm run deploy
```

The script uses the Vercel REST API (no CLI install needed) to:

1. verify the token, then create or reuse the `unique-ai-frontdesk` project and link
   `santjangid62/unique-ai-frontdesk` to it
2. upsert `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` and `NODE_ENV` for production + preview
3. trigger a production deployment from `main` and stream its state until it finishes (build log tail on failure)
4. seed the production database with the demo workspace
5. verify the live URL: `/api/health` (`db: connected`), the SPA shell, a real login + `/api/auth/me`,
   tenant-scoped `/api/leads`, anonymous `401`, the public widget config, and that a wrong password is rejected

It exits non-zero if any live check fails. Useful flags: `--skip-seed`, and
`--skip-deploy --url https://app.vercel.app` to verify an existing deployment without redeploying.
Secrets are never printed (the Mongo URI is masked), and an empty variable is never pushed to Vercel.

`npm run test:deploy` runs this entire flow against a local mock Vercel API and a mock deployment —
project creation, repo link, env upsert, polling, a healthy run, a disconnected database and a failed
build — so the script can be verified without a token, network or database.

### MongoDB Atlas

Create a free cluster, a database user and allow Vercel egress (or `0.0.0.0/0` for a pilot), then copy the
connection string into `MONGODB_URI` (append `/unique-frontdesk`).

Or let the Admin API do it: create an **Organization Owner** API key
(Access Manager → API Keys, API access list `0.0.0.0/0`), save the public key on line 1 and the private key on
line 2 of `atlas-key.txt` (gitignored), then:

```bash
npm run atlas:setup            # M0 free cluster + DB user + 0.0.0.0/0 + MONGODB_URI in .env
npm run atlas:setup -- --seed  # ...and seed the demo workspace
```

The script reuses an existing project and any free (M0) cluster already in it regardless of its name, rotates the
password of the `unique_admin` user if it already exists, waits for the cluster to become IDLE, writes
`MONGODB_URI`, fills any missing `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` in `.env`, and finally runs `db:check`.

A project-scoped key also works: set `ATLAS_PROJECT_ID=<project id>` and the script skips the organization lookup
and project creation entirely (the key then needs the Project Owner role for that project).

`npm run atlas:setup -- --dry-run` prints the requests without sending them, `-- --no-verify` skips the
connection check, and `npm run test:atlas` exercises digest auth, the stale-nonce retry, cluster reuse and the M0
payload against a local mock of the Atlas API (no keys or network needed).

### Local MongoDB instead of Atlas

`npm run db:local` starts a mongod from `.mongo/` (downloading it once) with data in `.mongo-data/`, and the app
accepts credential-less local URIs such as `mongodb://127.0.0.1:27017/unique-frontdesk`.

### Optional provider configuration

- **OpenAI:** set `OPENAI_API_KEY` (server-side only). Without it the assistant runs in grounded fallback mode.
- **WhatsApp:** create an app in Meta for Developers, set the webhook URL to `https://<domain>/api/webhooks/whatsapp`,
  the verify token to `WHATSAPP_VERIFY_TOKEN`, and set `WHATSAPP_APP_SECRET`. Add the phone number ID and access
  token under **Business Settings → Channel integrations**.
- **Voice:** point your Twilio number's voice webhook to `https://<domain>/api/voice/incoming` and set
  `TWILIO_AUTH_TOKEN`. Map the number to the business in **Channel integrations**.
- **Payments:** `POST /api/subscriptions/change-plan` records invoices with `pending` status; add a Razorpay
  webhook to mark them paid. No gateway credentials are included.

## Verification

```bash
npm run build         # Vite production build
npm run smoke         # end-to-end API checks against a running, seeded server
npm run smoke:ci      # the same suite, self-contained: in-memory MongoDB + seed + app
npm run lock:check    # fails if package-lock.json drifted from package.json (root + client)
```

`npm run smoke:ci` needs no database or server: it starts a throwaway in-memory MongoDB, seeds the demo
workspace, serves the app on an ephemeral port and runs `npm run smoke` against it. CI runs the client build,
`npm run smoke:ci` and `npm test` on every push, so a broken build, auth regression or tenant-isolation bug
fails before deployment.

`npm run lock:check` uses `npm ci --dry-run --ignore-scripts`, so it downloads nothing — CI runs it before
`npm ci` and fails fast when a dependency was added without regenerating a lockfile.

`npm run smoke` covers health, login, RBAC, tenant isolation, lead dedupe, double-booking prevention, grounded
AI answers, escalation on unknown questions, platform analytics and CSV export.
