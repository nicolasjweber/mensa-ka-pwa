# Mensa KA PWA & CORS Proxy

Cloudflare Worker serving the Mensa KA PWA and a restricted CORS proxy for the mensa-ka.de API.

## Structure

- `src/`: Worker code and proxy logic
- `web/`: Static PWA assets served by the Worker
- `test/`: Worker tests

## Routes

- `/`: Serves the PWA
- `/api/`: Proxies the upstream GraphQL API

## Access model

- The Worker can be protected with Cloudflare Access.
- `POST /api/` is allowed for same-origin requests and Tailscale origins.
- `GET /api/` for the GraphQL playground is restricted to Tailscale-originated requests.

## Cloudflare Access

This Worker validates Cloudflare Access JWTs before serving either the PWA or the API.

Configure these variables for deployment:

- `POLICY_AUD`: the Access application audience
- `TEAM_DOMAIN`: your Access team domain, for example `https://your-team.cloudflareaccess.com`

For local development, copy `.dev.vars.example` to `.dev.vars` and fill in the values if you want to test Access-backed requests. Requests to `localhost` are allowed without Access validation so `wrangler dev` remains usable.

## Local development

```powershell
cd cors-header-proxy
npx wrangler dev
```

Open `http://localhost:8787`.

## Deploy

```powershell
cd cors-header-proxy
npx wrangler deploy
```
