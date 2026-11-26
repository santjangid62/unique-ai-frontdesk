# Unique AI Frontdesk

Unique AI Frontdesk — a product of **Unique IT Solutions, a unit of Unique Computers, The Best One**
([uniqueitsolutionsjaipur.com](https://uniqueitsolutionsjaipur.com)). All rights reserved.

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

Demo logins created by `npm run seed` — role, portal URL, email and password — are listed once, in the
[setup guide's local-run section](docs/SETUP-GUIDE.html#s7), so credentials only have to be updated in one place.

The seed also creates a neutral public workspace for the landing page demo at `/chat/demo`
(tenant `demo`, "Demo Business" with generic services, prices and booking policy).

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
npm run demo:reset                  # local-only: drop the DB and rebuild all of the above
```

`demo:reset` is the way back to a clean demo state after manual testing has changed data the seed cannot
recognise (lead statuses, cancelled appointments, staff replies). It refuses to run against a non-local URI.

`demo:data` prints the logins it uses. Besides the seeded demo accounts it creates a tester login (business admin)
so testers can work without the owner account; that account is in the same guide table.

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
| Business email verification with a 6-digit code | `routes/auth.routes.js`, `services/email.js`, `pages/Auth.jsx` |
| Separate sign-in portals per role | `/login/super-admin`, `/login/business`, `/login/staff` |
| English / Hindi UI switcher | `client/src/i18n/index.jsx` |
| Indian mobile validation (10 digits, no +91) | `server/src/utils/phone.js`, `components/ui.jsx` (`PhoneInput`) |

## Sign-in portals, language and verification

- **Separate portals:** `/login` is a chooser; each role has its own URL — `/login/super-admin`,
  `/login/business`, `/login/staff`. The server rejects a login when the account role does not match the portal
  (`WRONG_PORTAL`), so a staff account cannot sign in from the platform console.
- **Business registration is verified by email.** `POST /api/auth/register` creates the workspace but returns no
  session; it emails a 6-digit code valid for 15 minutes. The owner verifies through `/verify-email`, and only then
  does `POST /api/auth/verify-email` issue tokens. A login attempt before verification returns
  `403 EMAIL_NOT_VERIFIED`, writes an in-app notification and points the user to the verification screen.
- **Language:** the header/sidebar switcher (and the one on the landing and auth pages) toggles English and
  Hindi; the choice is stored in `localStorage` and applied across navigation, forms, tables, empty states and
  the shared UI components.
- **Mobile numbers:** the user types 10 digits (the `+91` prefix is shown but not required). Accepts `6-9` as the
  first digit; `+91`, `0` prefixes and spaces are normalised away before saving.

### Email delivery

Set `RESEND_API_KEY` (Resend HTTP API, no SDK) and optionally `MAIL_FROM` and `APP_URL`. Without a key, development
keeps working: the code is printed in the API log and returned as `devCode` outside production, and the verification
screen shows it. In production the code is only emailed, never returned by the API.

## AI grounding rules

`services/ai.js` enforces, in the system prompt and in code:

1. Answers come only from the business profile and enabled knowledge entries.
2. Unknown questions set `escalate: true` instead of inventing fees, availability or policies.
3. Appointments are only confirmed after `services/booking.js` successfully saves the booking.
4. If `OPENAI_API_KEY` is missing or the provider fails, a deterministic retrieval-only fallback answers and
   escalates when nothing relevant is found.

To train the AI for a specific business (profile, agent instructions, knowledge entries, widget, testing and
maintenance), follow the step-by-step guide in [`docs/AI_TRAINING_GUIDE.md`](docs/AI_TRAINING_GUIDE.md).

## API

Every response uses one envelope: `{ "success": true, "data": ..., "meta": ... }` or
`{ "success": false, "error": { "code", "message", "details?" } }`.

```
POST   /api/auth/register | login | logout | refresh | forgot-password | reset-password
POST   /api/auth/verify-email | resend-verification
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

A step-by-step checklist lives in [`docs/DEPLOY_ONLINE.md`](docs/DEPLOY_ONLINE.md).

`vercel.json` builds the Vite client and exposes the Express app as a serverless function at `api/index.js`.

1. Push this repository to GitHub.
2. Import it in Vercel (framework preset: **Other**). Build command and output directory come from `vercel.json`.
3. Add environment variables in **Project → Settings → Environment Variables**:
   `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CLIENT_ORIGIN` and `APP_URL` (both your Vercel URL), and optionally
   `OPENAI_API_KEY`, `OPENAI_MODEL`, `TWILIO_AUTH_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`.
   `MONGODB_URI` must be the Atlas `mongodb+srv://…` string: a local `mongodb://127.0.0.1…` URI cannot be
   reached from a Vercel Function.
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

The token has to be the real one: placeholders such as `abcd1234…`, `your-token`, `paste-here`, `xxxx`, or a quoted
value are rejected at the credentials step, before any Vercel API call.

The script uses the Vercel REST API (no CLI install needed) to:

1. verify the token, then create or reuse the `unique-ai-frontdesk` project and link
   `santjangid62/unique-ai-frontdesk` to it
2. upsert `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `NODE_ENV`, `CLIENT_ORIGIN` and `APP_URL` for
   production + preview (`CLIENT_ORIGIN`/`APP_URL` default to `https://<project>.vercel.app`; a localhost value
   in `.env` is replaced, a custom domain is kept)
3. trigger a production deployment from `main` and stream its state until it finishes (build log tail on failure)
4. seed the production database with the demo workspace
5. verify the live URL: `/api/health` (`db: connected`), the SPA shell, a real login + `/api/auth/me`,
   tenant-scoped `/api/leads`, anonymous `401`, the public widget config, and that a wrong password is rejected

Before touching Vercel it pings `MONGODB_URI` (8s timeout), so a wrong Atlas password or a blocked IP fails in
seconds instead of after a build. If `MONGODB_URI` still points at a local mongod, the script stops at the
credentials step without touching the Vercel project and prints the Atlas setup steps: free M0 cluster on cloud.mongodb.com → database user under
**Database Access** → `0.0.0.0/0` under **Network Access** → copy the `mongodb+srv://…` string from
**Connect → Drivers → Node.js** → paste it as `MONGODB_URI` in `.env`.

It exits non-zero if any live check fails. Useful flags: `--dry-run` (validate the token, Atlas connection and
project, then stop without changing anything), `--skip-seed`, `--skip-preflight` (skip the Atlas connection test),
and `--skip-deploy --url https://app.vercel.app` to verify an existing deployment without redeploying.
Secrets are never printed (the Mongo URI is masked), and an empty variable is never pushed to Vercel.

`npm run test:deploy` runs this entire flow against a local mock Vercel API and a mock deployment —
project creation, repo link, env upsert, polling, a healthy run, a disconnected database, a failed build, a
local MongoDB URI refused before any Vercel API call, a 401/403 token rejection that shows only the friendly message
(never the raw Vercel error), placeholder tokens refused before the first API call, and a `--dry-run` that changes
nothing — so the script can be verified without a token, network or database.

`npm run test:credentials` reads `DEMO_CREDENTIALS`, the tester login and the setup guide's demo-login table
and fails if an email or password differs, so the published logins cannot drift from what the seed creates.

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
accepts credential-less local URIs such as `mongodb://127.0.0.1:27017/unique-frontdesk`. Local URIs are for
development only — `npm run deploy` refuses one and prints the Atlas setup steps instead, and `npm run seed`
refuses a local URI when `NODE_ENV=production` so a production seed cannot silently hit your machine.

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
npm run test:credentials  # fails if the guide's demo-login table drifted from the seed
npm run pdf:build     # rebuild the setup-guide PDF from the HTML and restamp it
npm run test:docs-pdf # fails if that PDF is older than the HTML
```

The signup checks create a throwaway business (`Smoke Verify Institute`). When `MONGODB_URI` is
available, `scripts/smoke-cleanup.js` removes it and its data at the end of the run. It also sweeps
leftovers from earlier crashed runs at the start (capped at 25 per run). Every deletion is guarded by
the exact tenant name, the `smoke.verify.<timestamp>@example.com` contact email and an age window.

`npm run smoke:ci` needs no database or server: it starts a throwaway in-memory MongoDB, seeds the demo
workspace, serves the app on an ephemeral port and runs `npm run smoke` against it. CI (`.github/workflows/test.yml`)
runs on every push and pull request as two parallel jobs: **docs checks** (install-free, so it finishes first) runs
`npm run test:credentials` and `npm run test:docs-pdf` — the guide's demo-login table must match the seed scripts
and its PDF must be rebuilt from the current HTML — while the **test** job runs the lockfile check, installs, the
client build, `npm run smoke:ci` and `npm test`. A broken build, auth regression, tenant-isolation bug, drifted
demo password or stale PDF fails before deployment or merge.

Both jobs declare `timeout-minutes` (10 for the install-free docs job, 30 for the build/test job), so a hung step
fails its job after that window instead of leaving the run — and a protected-branch pull request — pending forever.

`npm run lock:check` uses `npm ci --dry-run --ignore-scripts`, so it downloads nothing — CI runs it before
`npm ci` and fails fast when a dependency was added without regenerating a lockfile.

`npm run pdf:build` needs a browser installed: Google Chrome or Microsoft Edge (or `google-chrome`/`chromium` on
Linux), run headlessly — set `CHROME_BIN` to the executable if it is somewhere unusual. It prints
`docs/SETUP-GUIDE.html` to `docs/Unique-AI-Frontdesk-Setup-Guide.pdf` and records a digest of the HTML **content**
in `docs/SETUP-GUIDE.pdf.json`.

`npm run test:docs-pdf` compares that digest, so editing the HTML without rebuilding the PDF fails the push. The
digest ignores BOM, line endings and trailing spaces, and the PDF's own bytes are not compared, so rebuilding the
guide on another OS or a newer Chrome still passes CI.

`npm run smoke` covers health, login, RBAC, tenant isolation, lead dedupe, double-booking prevention, grounded
AI answers, escalation on unknown questions, platform analytics and CSV export.

## Contributing workflow

`main` is protected, so every change lands through a pull request and a direct push is rejected:

1. **Branch** from an up-to-date `main`:
   ```bash
   git checkout main && git pull && git checkout -b feature/<short-name>
   ```
2. **Commit and push** the branch: `git push -u origin feature/<short-name>`. GitHub prints a
   `.../pull/new/<branch>` link in the push output.
3. **Open the pull request** against `main` from that link (or `gh pr create --fill` if the GitHub CLI is installed).
4. **Wait for both required checks to be green:** **docs checks** (`npm run test:credentials`, `npm run test:docs-pdf`)
   and **test** (lockfile check, root and client install, client build, `npm run smoke:ci`, `npm test`). The checks are
   required and the branch must be up to date with `main`, so if `main` moves while the PR is open, update the branch
   and let the checks run again.
5. **Merge** only once both are green — a squash merge keeps `main`'s history linear.

What the rule enforces on `main`: a pull request before merging (no approval count, so a solo maintainer can merge),
the two required status checks above, an up-to-date branch, no force pushes and no branch deletion. It applies to
administrators too, so `git push origin main` from any account is refused with
`! [remote rejected] HEAD -> main (protected branch hook declined)`.

If a required check goes red, fix the cause on the branch and push again (never merge around it): a drifted demo
password or stale PDF fails **docs checks**, while a build, smoke or unit-test failure fails **test**. If a run cannot
finish because of a runner or Actions outage, the PR stays at `mergeable_state: blocked`; the `timeout-minutes` above
turn a hung step into a failed job, and re-running the job is enough once the runner recovers. Only as an emergency
measure should an administrator lift the rule (Settings → Branches → `main`) and restore it afterwards.
