# Mensa KA Worker

Cloudflare Worker serving the Mensa KA PWA and a restricted CORS proxy for the mensa-ka.de API.

## Structure

- `src/`: Worker code and proxy logic
- `web/`: Static PWA assets served by the Worker
- `test/`: Worker tests

## Routes

- `/`: Serves the PWA
- `/api/`: Proxies the upstream GraphQL API

## Access model

- The PWA is publicly reachable.
- `POST /api/` is allowed for same-origin requests and Tailscale origins.
- `GET /api/` for the GraphQL playground is restricted to Tailscale-originated requests.

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
