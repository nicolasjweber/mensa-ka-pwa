const API_URL = "https://api.mensa-ka.de/";
const PROXY_ENDPOINT = "/mensa-ka/";
const TAILSCALE_ORIGIN_SUFFIX = ".ts.net";

const LANDING_PAGE = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mensa-KA API CORS Proxy</title>
    <style>
        body { font-family: -apple-system, system-ui, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 40px auto; padding: 0 20px; }
        code { background: #f4f4f4; padding: 2px 5px; border-radius: 4px; font-family: monospace; }
        .card { border: 1px solid #ddd; padding: 20px; border-radius: 8px; background: #fafafa; }
        h1 { color: #2c3e50; }
        .endpoint { color: #0070f3; font-weight: bold; }
    </style>
</head>
<body>
    <h1>&#x1F374; mensa-ka api cors proxy</h1>
    <p>This is a lightweight proxy to bypass CORS restrictions for the <strong>mensa-ka.de</strong> API.</p>

    <div class="card">
        <h3>Usage</h3>
        <p>Prepend the proxy path to your API calls:</p>
        <code>${PROXY_ENDPOINT}[original-endpoint]</code>
    </div>
</body>
</html>
`;

function addCorsHeaders(headers: Headers, request: Request) {
	headers.set("Access-Control-Allow-Origin", "*");
	headers.set("Access-Control-Allow-Methods", "GET,HEAD,POST,OPTIONS");
	headers.set(
		"Access-Control-Allow-Headers",
		request.headers.get("Access-Control-Request-Headers") ?? "Content-Type",
	);
}

function isAllowedOrigin(origin: string | null, requestUrl: URL) {
	if (!origin) {
		return false;
	}

	try {
		const originUrl = new URL(origin);
		return (
			originUrl.origin === requestUrl.origin ||
			originUrl.hostname.endsWith(TAILSCALE_ORIGIN_SUFFIX)
		);
	} catch {
		return false;
	}
}

function rewritePlaygroundHtml(body: string) {
	return body.replace(
		/(["']?endpoint["']?\s*:\s*["'])\/(["'])/g,
		`$1${PROXY_ENDPOINT}$2`,
	);
}

async function rewritePlaygroundResponse(
	request: Request,
	response: Response,
	proxiedPath: string,
) {
	const contentType = response.headers.get("Content-Type") ?? "";
	if (
		request.method !== "GET" ||
		proxiedPath !== "" ||
		!contentType.includes("text/html")
	) {
		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers,
		});
	}

	const rewrittenBody = rewritePlaygroundHtml(await response.text());
	const headers = new Headers(response.headers);
	headers.delete("Content-Length");
	return new Response(rewrittenBody, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

async function handleRequest(request: Request) {
	const url = new URL(request.url);
	const proxiedPath = url.pathname.replace(PROXY_ENDPOINT, "");
	const upstreamUrl = new URL(proxiedPath, API_URL);
	upstreamUrl.search = url.search;

	const upstream = new Request(upstreamUrl, request);
	upstream.headers.set("Origin", new URL(API_URL).origin);

	const upstreamResponse = await fetch(upstream);
	const response = await rewritePlaygroundResponse(
		request,
		upstreamResponse,
		proxiedPath,
	);
	const headers = new Headers(response.headers);
	addCorsHeaders(headers, request);

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

function handleOptions(request: Request) {
	const headers = new Headers();
	addCorsHeaders(headers, request);
	headers.set("Access-Control-Max-Age", "86400");

	return new Response(null, {
		status: 204,
		headers,
	});
}

export { handleRequest, isAllowedOrigin, rewritePlaygroundHtml };

export default {
	async fetch(request: Request) {
		const url = new URL(request.url);

		if (url.pathname === "/" || url.pathname === "/index.html") {
			return new Response(LANDING_PAGE, {
				headers: { "Content-Type": "text/html;charset=UTF-8" },
			});
		}

		if (url.pathname.startsWith(PROXY_ENDPOINT)) {
			const origin = request.headers.get("Origin");

			if (request.method !== "OPTIONS") {
				if (request.method !== "GET" || origin) {
					if (!isAllowedOrigin(origin, url)) {
						return new Response(
							"Forbidden: Access restricted to Tailscale network.",
							{ status: 403 },
						);
					}
				}
			}

			if (request.method === "OPTIONS") {
				return handleOptions(request);
			}

			if (["GET", "HEAD", "POST"].includes(request.method)) {
				return handleRequest(request);
			}

			return new Response("Method Not Allowed", { status: 405 });
		}

		return new Response("Not found", { status: 404 });
	},
};
