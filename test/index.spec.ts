import { afterEach, describe, expect, it, vi } from "vitest";

import worker, {
	handleRequest,
	isAllowedOrigin,
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
	});

	it("blocks public playground access", async () => {
		const response = await worker.fetch(
			new Request("http://localhost/api/"),
		);

		expect(response.status).toBe(403);
	});

	it("allows playground access from tailscale referers", async () => {
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
			new Request("http://localhost/api/", {
				headers: {
					Referer: "https://admin.tail123.ts.net/tools",
				},
			}),
		);

		expect(response.status).toBe(200);
		expect(await response.text()).toContain(`endpoint: "/api/"`);
	});

	it("allows same-origin POST requests", async () => {
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
	});

	it("rejects foreign POST origins", async () => {
		const response = await worker.fetch(
			new Request("http://localhost/api/", {
				method: "POST",
				headers: {
					Origin: "https://evil.example",
				},
			}),
		);

		expect(response.status).toBe(403);
	});

	it("accepts tailscale origins", () => {
		expect(
			isAllowedOrigin("https://client.tail123.ts.net", new URL("https://proxy.example")),
		).toBe(true);
		expect(
			isAllowedOrigin("https://proxy.example", new URL("https://proxy.example")),
		).toBe(true);
		expect(
			isAllowedOrigin("https://evil.example", new URL("https://proxy.example")),
		).toBe(false);
	});

	it("rewrites only endpoint declarations", () => {
		expect(rewritePlaygroundHtml(`{"endpoint":"/","other":"/"}`)).toBe(
			`{"endpoint":"/api/","other":"/"}`,
		);
	});
});
