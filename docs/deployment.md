# Deployment

OmniBuy AI deploys as two Render web services driven by [`render.yaml`](../render.yaml).

| Service | Runtime | Root | Start command |
| --- | --- | --- | --- |
| `omnibuy-api` | Python 3.12 | repo root | `uvicorn app.main:app --app-dir apps/api --host 0.0.0.0 --port $PORT` |
| `omnibuy-web` | Node 22 | `apps/web` | `npm run start -- -p $PORT` |

The API service mounts a 1 GB persistent disk at `/var/data` and stores SQLite at
`sqlite:////var/data/omnibuy.db`. Decision Proofs, approvals, orders, captures and
policy events therefore survive restarts and redeploys.

## 1. Create the services

1. Push this repository to GitHub.
2. In Render: **New → Blueprint**, select the repository, and apply `render.yaml`.
3. Render creates both services. The first deploy of `omnibuy-web` fails its API
   calls until `NEXT_PUBLIC_API_URL` is set — that is expected.

## 2. Set API environment variables

Set these on `omnibuy-api` (secrets are never committed):

| Variable | Value |
| --- | --- |
| `CHANNEL3_API_KEY` | Channel3 API key |
| `CHANNEL3_BASE_URL` | `https://api.trychannel3.com/v1` |
| `LLM_BASE_URL` | OpenAI-compatible base URL (e.g. `https://api.groq.com/openai/v1`) |
| `LLM_API_KEY` | API key for the LLM used by natural-language intent parsing |
| `LLM_MODEL` | e.g. `openai/gpt-oss-120b` |
| `PAYPAL_CLIENT_ID` | PayPal Sandbox app client ID |
| `PAYPAL_CLIENT_SECRET` | PayPal Sandbox app secret |
| `PAYPAL_ENV` | `sandbox` |
| `PAYPAL_BASE_URL` | `https://api-m.sandbox.paypal.com` |
| `OMNIBUY_ALLOWED_ORIGINS` | Public URL of `omnibuy-web`, e.g. `https://omnibuy-web.onrender.com` |
| `OMNIBUY_PUBLIC_URL` | Same public URL of `omnibuy-web` |

`LLM_*` is optional at the infrastructure level but required for the
natural-language intent parsing demo: without it, proposals still work but the
budget falls back to the persisted policy session cap.

`OMNIBUY_DATABASE_URL` is already set by the blueprint. Do not point it at a path
outside `/var/data`, or data will be lost on redeploy.

## 3. Set web environment variables

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | Public URL of `omnibuy-api`, e.g. `https://omnibuy-api.onrender.com` |

`NEXT_PUBLIC_*` values are inlined at build time. After changing it, trigger a new
deploy of `omnibuy-web`.

## 4. Verify

```bash
curl https://<api-host>/api/health
# {"ok":true,"service":"omnibuy-ai","payments":"paypal-sandbox","discovery":"channel3"}

curl https://<api-host>/api/policy
```

Then open the web URL and complete one full flow: proposal → Decision Proof →
approve → PayPal Sandbox → `/checkout?token=...` → capture ID in Audit Ledger.

## PayPal return URL

Create the PayPal Sandbox order from the deployed app so the return URL is based
on `OMNIBUY_PUBLIC_URL`. If you change the web hostname, restart the API service
so the cached settings are reloaded.

## Free-tier alternative

`plan: starter` is required for the persistent disk. With `plan: free`, remove
the `disk` block and accept that SQLite (and therefore the audit trail) resets on
every restart or deploy.

## Security notes

- Only sandbox PayPal credentials belong in this project.
- `.env.local`, `*.db`, `.next/`, and `node_modules/` are git-ignored.
- The API never trusts the browser to confirm payment: the capture call verifies
  that the PayPal order belongs to an approved Decision Proof before settling.
