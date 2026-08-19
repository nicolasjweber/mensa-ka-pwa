import { createRemoteJWKSet, jwtVerify } from "jose";

const API_URL = "https://api.mensa-ka.de/";
const PROXY_ENDPOINT = "/api/";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);
const CACHE_TTL_SECONDS = 900; // 15 minutes edge TTL

interface Env {
	POLICY_AUD: string;
	TEAM_DOMAIN: string;
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function normalizeTeamDomain(teamDomain: string) {
	return teamDomain.replace(/\/+$/, "");
}

function getJwks(teamDomain: string) {
	const cached = jwksCache.get(teamDomain);
	if (cached) {
		return cached;
	}

	const jwks = createRemoteJWKSet(
		new URL(`${normalizeTeamDomain(teamDomain)}/cdn-cgi/access/certs`),
	);
	jwksCache.set(teamDomain, jwks);
	return jwks;
}

function isLocalDevelopmentRequest(url: URL) {
	return LOCAL_HOSTS.has(url.hostname);
}

async function requireCloudflareAccess(request: Request, env: Env) {
	const url = new URL(request.url);
	if (isLocalDevelopmentRequest(url)) {
		return null;
	}

	if (!env.POLICY_AUD || !env.TEAM_DOMAIN) {
		return new Response(
			"Cloudflare Access is enabled but POLICY_AUD or TEAM_DOMAIN is missing.",
			{
				status: 500,
				headers: { "Content-Type": "text/plain" },
			},
		);
	}

	const token = request.headers.get("cf-access-jwt-assertion");
	if (!token) {
		return new Response("Missing required CF Access JWT", {
			status: 403,
			headers: { "Content-Type": "text/plain" },
		});
	}

	const teamDomain = normalizeTeamDomain(env.TEAM_DOMAIN);

	try {
		await jwtVerify(token, getJwks(teamDomain), {
			issuer: teamDomain,
			audience: env.POLICY_AUD,
		});
		return null;
	} catch {
		return new Response("Invalid Cloudflare Access token", {
			status: 403,
			headers: { "Content-Type": "text/plain" },
		});
	}
}

function addSecurityHeaders(headers: Headers) {
	headers.set("X-Content-Type-Options", "nosniff");
	headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
}

function addCorsHeaders(headers: Headers, request: Request) {
	headers.set("Access-Control-Allow-Origin", "*");
	headers.set("Access-Control-Allow-Methods", "GET,HEAD,POST,OPTIONS");
	headers.set(
		"Access-Control-Allow-Headers",
		request.headers.get("Access-Control-Request-Headers") ??
			"Content-Type, Cache-Control, Pragma, X-Refresh",
	);
	headers.set("Access-Control-Expose-Headers", "X-Cache-Status");
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

function isForceRefreshRequested(request: Request, url: URL): boolean {
	const cacheControl = request.headers.get("Cache-Control")?.toLowerCase() ?? "";
	const pragma = request.headers.get("Pragma")?.toLowerCase() ?? "";
	const refreshHeader = request.headers.get("X-Refresh")?.toLowerCase() ?? "";

	return (
		cacheControl.includes("no-cache") ||
		cacheControl.includes("max-age=0") ||
		pragma.includes("no-cache") ||
		refreshHeader === "true" ||
		refreshHeader === "1" ||
		url.searchParams.has("refresh")
	);
}

function createGraphQLCacheKey(requestUrl: URL, bodyText: string): Request {
	let keyParam = "";
	try {
		const parsed = JSON.parse(bodyText);
		const op = parsed.operationName ?? "query";
		const date = parsed.variables?.date ?? "";
		keyParam = `${op}:${date}`;
	} catch {
		keyParam = "raw:" + bodyText.slice(0, 80);
	}

	const cacheUrl = new URL(requestUrl.toString());
	cacheUrl.searchParams.set("__gql_key", keyParam);
	return new Request(cacheUrl.toString(), { method: "GET" });
}

function getCloudflareCache(): Cache | null {
	try {
		return typeof caches !== "undefined" && caches.default ? caches.default : null;
	} catch {
		return null;
	}
}

async function handleRequest(request: Request) {
	const url = new URL(request.url);
	const proxiedPath = url.pathname.replace(PROXY_ENDPOINT, "");
	const upstreamUrl = new URL(proxiedPath, API_URL);
	upstreamUrl.search = url.search;

	const forceRefresh = isForceRefreshRequested(request, url);
	const isGraphQLPost = request.method === "POST" && proxiedPath === "";

	let bodyText = "";
	let cacheKeyRequest: Request | null = null;
	const cache = getCloudflareCache();

	if (isGraphQLPost) {
		bodyText = await request.text();
		cacheKeyRequest = createGraphQLCacheKey(url, bodyText);

		// If this is a standard request (not a manual refresh), try checking edge cache
		if (!forceRefresh && cache && cacheKeyRequest) {
			const cachedResponse = await cache.match(cacheKeyRequest);
			if (cachedResponse) {
				const headers = new Headers(cachedResponse.headers);
				addCorsHeaders(headers, request);
				addSecurityHeaders(headers);
				headers.set("X-Cache-Status", "HIT");
				return new Response(cachedResponse.body, {
					status: cachedResponse.status,
					statusText: cachedResponse.statusText,
					headers,
				});
			}
		}
	}

	const upstreamRequestInit: RequestInit = {
		method: request.method,
		headers: new Headers(request.headers),
	};
	if (isGraphQLPost) {
		upstreamRequestInit.body = bodyText;
	}

	const upstream = new Request(upstreamUrl, upstreamRequestInit);
	upstream.headers.set("Origin", new URL(API_URL).origin);

	const upstreamResponse = await fetch(upstream);
	const response = await rewritePlaygroundResponse(
		request,
		upstreamResponse,
		proxiedPath,
	);

	const headers = new Headers(response.headers);
	addCorsHeaders(headers, request);
	addSecurityHeaders(headers);

	const cacheStatus = forceRefresh ? "BYPASS" : "MISS";
	headers.set("X-Cache-Status", cacheStatus);

	const responseText = await response.text();

	// Cache successful GraphQL responses in Cloudflare Edge Cache
	if (isGraphQLPost && response.ok && cache && cacheKeyRequest) {
		const cacheHeaders = new Headers(headers);
		cacheHeaders.set(
			"Cache-Control",
			`public, max-age=${CACHE_TTL_SECONDS}, s-maxage=${CACHE_TTL_SECONDS}`,
		);

		const responseToCache = new Response(responseText, {
			status: response.status,
			statusText: response.statusText,
			headers: cacheHeaders,
		});

		try {
			await cache.put(cacheKeyRequest, responseToCache);
		} catch {
			// Ignore cache storage errors in environments without cache support
		}
	}

	return new Response(responseText, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

function handleOptions(request: Request) {
	const headers = new Headers();
	addCorsHeaders(headers, request);
	addSecurityHeaders(headers);
	headers.set("Access-Control-Max-Age", "86400");

	return new Response(null, {
		status: 204,
		headers,
	});
}

export { handleRequest, rewritePlaygroundHtml, isForceRefreshRequested, createGraphQLCacheKey };

export default {
	async fetch(request: Request, env: Env) {
		const accessResponse = await requireCloudflareAccess(request, env);
		if (accessResponse) {
			return accessResponse;
		}

		const url = new URL(request.url);
		if (url.pathname.startsWith(PROXY_ENDPOINT)) {
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
