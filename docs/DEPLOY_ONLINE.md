# Deploy guide — Vercel + MongoDB Atlas

A focused checklist for taking Unique AI Frontdesk live with `npm run deploy`. For the full feature and API
reference see the [README](../README.md); for a Hindi walkthrough see [`SETUP-GUIDE.html`](SETUP-GUIDE.html).

## 1. Before you start

| What | Where | Why |
| --- | --- | --- |
| Atlas connection string | `.env` → `MONGODB_URI=mongodb+srv://user:password@cluster0.xxxxx.mongodb.net/unique-frontdesk` | Vercel Functions cannot reach a local MongoDB |
| Two JWT secrets | `.env` → `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| Vercel token | `deploy-token.txt` (one line, gitignored) — or `VERCEL_TOKEN` | Created at <https://vercel.com/account/tokens> |

A local `MONGODB_URI` such as `mongodb://127.0.0.1:27017/unique-frontdesk` is for development only. The deploy
script refuses it at the credentials step, touches nothing on Vercel, and prints the Atlas steps below.

Placeholder tokens are refused too, before any Vercel API call: `abcd1234…`, `your-token`, `paste-here`, `xxxx`,
quoted or `<wrapped>` values, and anything with dashes, spaces or words like *example* or *dummy*. A real token is a
single bare random string — copy it from <https://vercel.com/account/tokens> (**Create Token**) and paste it as the
only non-comment line in `deploy-token.txt`.

## 2. Atlas setup (free M0)

1. <https://cloud.mongodb.com> → **Create** → free **M0** cluster.
2. **Database Access** → **Add New Database User** (save the username and password).
3. **Network Access** → **Add IP Address** → `0.0.0.0/0` (Vercel egress IPs change).
4. **Connect** → **Drivers** → **Node.js** → copy the `mongodb+srv://…` string, append `/unique-frontdesk`,
   and paste it into `.env` as `MONGODB_URI` (one line, real password).

Alternative: `npm run atlas:setup` does all four steps with an Atlas API key (see the README).

## 3. Rehearse, then deploy

```bash
npm run deploy -- --dry-run   # token + Atlas ping + project lookup; changes nothing
npm run deploy                # deploy, seed and verify
```

What the real run does:

1. validates `.env` and `deploy-token.txt`, and pings `MONGODB_URI` (8s timeout) so a bad password/IP fails
   before any build
2. creates or reuses the `unique-ai-frontdesk` project and links the GitHub repository
3. sets `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `NODE_ENV`, `CLIENT_ORIGIN` and `APP_URL`
   (the two URLs default to `https://<project>.vercel.app`; a localhost value is replaced, a custom domain kept)
4. triggers a production deployment from `main` and waits for `READY` (build log tail on failure)
5. seeds the production database with the demo workspace (`NODE_ENV=production`; a local URI is rejected)
6. verifies the live URL: `/api/health` with `db: connected`, SPA shell, CORS for the live origin, login +
   `/api/auth/me`, tenant-scoped `/api/leads`, anonymous `401`, public widget config, wrong password rejected

Flags: `--skip-seed` (no reseed), `--skip-preflight` (skip the Atlas ping), `--skip-deploy --url https://…`
(verify an existing deployment only).

## 4. If a step fails

| Message | Fix |
| --- | --- |
| `MONGODB_URI points at a local MongoDB` | Complete section 2 and put the Atlas URI in `.env` |
| `Cannot reach mongodb+srv://…` | Wrong password or Atlas **Network Access** missing `0.0.0.0/0` |
| `No Vercel token` | Save a token in `deploy-token.txt` or set `VERCEL_TOKEN` |
| `The token in deploy-token.txt looks like a placeholder` | Replace `abcd1234…`, `your-token`, `paste-here`, `xxxx` or a quoted value with the real token from <https://vercel.com/account/tokens> |
| `is not linked to the Vercel project` | Install the Vercel GitHub app for `santjangid62/unique-ai-frontdesk` |
| `db=disconnected` in the live checks | The deployed `MONGODB_URI` is wrong or Atlas blocks Vercel |
| CORS check fails / login blocked in the browser | Set `CLIENT_ORIGIN` and `APP_URL` to the real domain in `.env` and redeploy |

`npm run test:deploy` runs the whole flow against a local mock Vercel API, so the script can be checked without
a token, network or database.
