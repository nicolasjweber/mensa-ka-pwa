import { createRemoteJWKSet, jwtVerify } from "jose";

const API_URL = "https://api.mensa-ka.de/";
const PROXY_ENDPOINT = "/api/";
const TAILSCALE_ORIGIN_SUFFIX = ".ts.net";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

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

function addCorsHeaders(headers: Headers, request: Request) {
	headers.set("Access-Control-Allow-Origin", "*");
	headers.set("Access-Control-Allow-Methods", "GET,HEAD,POST,OPTIONS");
	headers.set(
		"Access-Control-Allow-Headers",
		request.headers.get("Access-Control-Request-Headers") ?? "Content-Type",
	);
}

function getSourceUrl(request: Request) {
	const origin = request.headers.get("Origin");
	if (origin) {
		try {
			return new URL(origin);
		} catch {
			return null;
		}
	}

	const referer = request.headers.get("Referer");
	if (referer) {
		try {
			return new URL(referer);
		} catch {
			return null;
		}
	}

	return null;
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

function isPlaygroundRequestAllowed(request: Request) {
	const sourceUrl = getSourceUrl(request);
	return sourceUrl?.hostname.endsWith(TAILSCALE_ORIGIN_SUFFIX) ?? false;
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
	async fetch(request: Request, env: Env) {
		const url = new URL(request.url);
		const accessResponse = await requireCloudflareAccess(request, env);
		if (accessResponse) {
			return accessResponse;
		}

		if (url.pathname.startsWith(PROXY_ENDPOINT)) {
			const origin = request.headers.get("Origin");
			const proxiedPath = url.pathname.replace(PROXY_ENDPOINT, "");

			if (
				request.method === "GET" &&
				proxiedPath === "" &&
				!isPlaygroundRequestAllowed(request)
			) {
				return new Response("Forbidden: Playground access requires Tailscale.", {
					status: 403,
				});
			}

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
