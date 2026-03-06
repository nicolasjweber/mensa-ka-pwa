const API_URL = "https://api.mensa-ka.de/";
const PROXY_ENDPOINT = "/mensa-ka/";

// Simple HTML template for the demo page
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
    <h1>🍴 mensa-ka api cors proxy</h1>
    <p>This is a lightweight proxy to bypass CORS restrictions for the <strong>mensa-ka.de</strong> API.</p>
    
    <div class="card">
        <h3>Usage</h3>
        <p>Prepend the proxy path to your API calls:</p>
        <code>${PROXY_ENDPOINT}[original-endpoint]</code>
    </div>
</body>
</html>
`;

async function handleRequest(request) {
  const url = new URL(request.url);
  // Remove the proxy prefix to get the actual path for the upstream
  const path = url.pathname.replace(PROXY_ENDPOINT, "");
  const upstreamUrl = new URL(path, API_URL);

  const upstream = new Request(upstreamUrl, request);
  upstream.headers.set("Origin", new URL(API_URL).origin);

  let response = await fetch(upstream);
  response = new Response(response.body, response);

  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET,HEAD,POST,OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");

  return response;
}

function handleOptions(request) {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
      "Access-Control-Allow-Headers":
        request.headers.get("Access-Control-Request-Headers") ?? "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // 1. Serve the Demo Page at the root
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(LANDING_PAGE, {
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }

    // 2. Handle Proxy Requests
    if (url.pathname.startsWith(PROXY_ENDPOINT)) {
      if (request.method === "OPTIONS") {
        return handleOptions(request);
      }

      const validMethods = ["GET", "HEAD", "POST"];
      if (validMethods.includes(request.method)) {
        return handleRequest(request);
      }

      return new Response("Method Not Allowed", { status: 405 });
    }

    // 3. Fallback 404
    return new Response("Not found", { status: 404 });
  },
};