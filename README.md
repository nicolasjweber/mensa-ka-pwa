<h1> Mensa Karlsruhe PWA & CORS Proxy</h1>

<p>
<img src="assets/screenshot.png" alt="Mensa KA PWA screenshot" width="720" />
</p>

Cloudflare Worker implementing a Progressive Web App (PWA) and serving a CORS proxy for the `mensa-ka.de` API.
Both the PWA and the proxy are protected through a combination of Cloudflare Access and ZITADEL.

## Routes

- `/`: Serves the Progressive Web App
- `/api/`: Proxies the upstream GraphQL API `api.mensa-ka.de`

## Cloudflare Access and ZITADEL

This Worker validates Cloudflare Access JWTs before serving either the PWA or the API.
Cloudflare Access handles policy enforcement, while ZITADEL acts as the upstream identity provider used for authentication.

Note: You need to configure `POLICY_AUD` and `TEAM_DOMAIN` for deployment.

## Local development

```powershell
npx wrangler dev
```

For local development, copy `.dev.vars.example` to `.dev.vars` and fill in the values if you want to test Access-backed requests. Requests to `localhost` are allowed without Access validation so `wrangler dev` remains usable.

Open `http://localhost:8787`.
