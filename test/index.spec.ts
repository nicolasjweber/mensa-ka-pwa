import { afterEach, describe, expect, it, vi } from "vitest";

import worker, {
	createGraphQLCacheKey,
	handleRequest,
	isForceRefreshRequested,
	rewritePlaygroundHtml,
} from "../src/index";

describe("cors-header-proxy", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("rewrites the proxied playground endpoint", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(
					`<script>window.GraphQLPlayground.init(root, { endpoint: "/" })</script>`,
					{
						headers: { "Content-Type": "text/html; charset=utf-8" },
					},
				),
			),
		);

		const response = await handleRequest(
			new Request("https://proxy.example/api/"),
		);

		expect(await response.text()).toContain(`endpoint: "/api/"`);
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
		expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
	});

	it("allows playground access without extra origin checks", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(
					`<script>window.GraphQLPlayground.init(root, { endpoint: "/" })</script>`,
					{
						headers: { "Content-Type": "text/html; charset=utf-8" },
					},
				),
			),
		);

		const response = await worker.fetch(
			new Request("http://localhost/api/"),
		);

		expect(response.status).toBe(200);
		expect(await response.text()).toContain(`endpoint: "/api/"`);
	});

	it("allows same-origin POST requests and adds cache status", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(JSON.stringify({ data: { ok: true } }), {
					headers: { "Content-Type": "application/json" },
				}),
			),
		);

		const response = await worker.fetch(
			new Request("http://localhost/api/", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Origin: "http://localhost",
				},
				body: JSON.stringify({ query: "{ __typename }" }),
			}),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ data: { ok: true } });
		expect(response.headers.get("X-Cache-Status")).toBe("MISS");
		expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
	});

	it("identifies force refresh requests correctly", () => {
		const regularReq = new Request("http://localhost/api/");
		expect(isForceRefreshRequested(regularReq, new URL(regularReq.url))).toBe(false);

		const cacheControlReq = new Request("http://localhost/api/", {
			headers: { "Cache-Control": "no-cache" },
		});
		expect(isForceRefreshRequested(cacheControlReq, new URL(cacheControlReq.url))).toBe(true);

		const pragmaReq = new Request("http://localhost/api/", {
			headers: { Pragma: "no-cache" },
		});
		expect(isForceRefreshRequested(pragmaReq, new URL(pragmaReq.url))).toBe(true);

		const customHeaderReq = new Request("http://localhost/api/", {
			headers: { "X-Refresh": "true" },
		});
		expect(isForceRefreshRequested(customHeaderReq, new URL(customHeaderReq.url))).toBe(true);

		const queryParamReq = new Request("http://localhost/api/?refresh=1");
		expect(isForceRefreshRequested(queryParamReq, new URL(queryParamReq.url))).toBe(true);
	});

	it("generates deterministic GraphQL cache keys", () => {
		const url = new URL("http://localhost/api/");
		const body = JSON.stringify({
			operationName: "GetMealPlanForDay",
			variables: { date: "2026-08-19" },
		});
		const cacheKey = createGraphQLCacheKey(url, body);
		expect(cacheKey.method).toBe("GET");
		expect(cacheKey.url).toContain("__gql_key=GetMealPlanForDay%3A2026-08-19");
	});

	it("returns BYPASS cache status when manual refresh is requested", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(JSON.stringify({ data: { ok: true } }), {
					headers: { "Content-Type": "application/json" },
				}),
			),
		);

		const response = await worker.fetch(
			new Request("http://localhost/api/", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Cache-Control": "no-cache",
				},
				body: JSON.stringify({ query: "{ __typename }" }),
			}),
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("X-Cache-Status")).toBe("BYPASS");
	});

	it("allows foreign POST origins when Access already allowed the request", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(JSON.stringify({ data: { ok: true } }), {
					headers: { "Content-Type": "application/json" },
				}),
			),
		);

		const response = await worker.fetch(
			new Request("http://localhost/api/", {
				method: "POST",
				headers: {
					Origin: "https://evil.example",
				},
				body: JSON.stringify({ query: "{ __typename }" }),
			}),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ data: { ok: true } });
	});

	it("rewrites only endpoint declarations", () => {
		expect(rewritePlaygroundHtml(`{"endpoint":"/","other":"/"}`)).toBe(
			`{"endpoint":"/api/","other":"/"}`,
		);
	});
});
