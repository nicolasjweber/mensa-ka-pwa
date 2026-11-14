import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const WEB_DIR = path.join(ROOT_DIR, "web");
const FIXTURES_DIR = path.join(__dirname, "fixtures");
const ASSETS_DIR = path.join(ROOT_DIR, "assets");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

const BROWSER_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

function findBrowserExecutable() {
  for (const candidate of BROWSER_CANDIDATES) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    `No Chromium-based browser executable found. Checked: ${BROWSER_CANDIDATES.join(", ")}. Set CHROME_PATH to override.`,
  );
}

function buildMockApiPayload(origin) {
  const dish1Primary = `${origin}/mock-images/dish-1.png`;
  const dish1Secondary = `${origin}/mock-images/dish-1.png?variant=2`;
  const dish2Primary = `${origin}/mock-images/dish-2.png`;

  return {
    data: {
      getCanteens: [
        {
          id: "canteen-adenauerring",
          name: "Mensa am Adenauerring",
          lines: [
            {
              id: "l1",
              name: "Linie 1 Gut & Günstig",
              meals: [
                {
                  id: "meal-pasta-veloute",
                  name: "Pasta Veloute mit Putenstreifen, Spinat, Kräutern",
                  mealType: "POULTRY",
                  images: [
                    { url: dish1Primary, rank: 2 },
                    { url: dish1Secondary, rank: 1 },
                  ],
                  ratings: { averageRating: 3.9, ratingsCount: 54 },
                  price: { student: 360, employee: 520, pupil: 390, guest: 620 },
                },
                {
                  id: "meal-pasta-planted",
                  name: "Pasta mit planted Veganer Hähnchen-Alternative, Knoblauch-Veloute, Spinat, Rote Bete",
                  mealType: "VEGETARIAN",
                  images: [],
                  ratings: { averageRating: 4.8, ratingsCount: 11 },
                  price: { student: 360, employee: 520, pupil: 390, guest: 620 },
                },
              ],
            },
            {
              id: "l2",
              name: "Linie 2 Vegane Linie",
              meals: [
                {
                  id: "meal-linsen-bolognese",
                  name: "Roter Linsen - Bolognese mit Kartoffeln",
                  mealType: "VEGAN",
                  images: [{ url: dish2Primary, rank: 1 }],
                  ratings: { averageRating: 3.6, ratingsCount: 7 },
                  price: { student: 350, employee: 500, pupil: 380, guest: 590 },
                },
                {
                  id: "meal-falafel-couscous",
                  name: "Knusprige Falafelbällchen auf Couscous-Gemüsepfanne mit Minz-Dip",
                  mealType: "VEGAN",
                  images: [],
                  ratings: { averageRating: 4.6, ratingsCount: 38 },
                  price: { student: 380, employee: 530, pupil: 410, guest: 630 },
                },
              ],
            },
            {
              id: "l3",
              name: "Linie 3",
              meals: [
                {
                  id: "meal-seelachsfilet",
                  name: "Seelachsfilet im Backteig mit hausgemachtem Kartoffelsalat und Remoulade",
                  mealType: "FISH",
                  images: [],
                  ratings: { averageRating: 4.3, ratingsCount: 29 },
                  price: { student: 440, employee: 590, pupil: 470, guest: 690 },
                },
              ],
            },
            {
              id: "koeri",
              name: "[kœri]werk",
              meals: [
                {
                  id: "meal-koeriwurst",
                  name: "Reine Kalbsbratwurst mit kœri-Sauce und Pommes frites",
                  mealType: "BEEF",
                  images: [],
                  ratings: { averageRating: 4.7, ratingsCount: 112 },
                  price: { student: 420, employee: 560, pupil: 450, guest: 650 },
                },
              ],
            },
          ],
        },
        { id: "canteen-erzberger", name: "Mensa Erzbergerstraße", lines: [] },
        { id: "canteen-gottesaue", name: "Mensa Gottesaue", lines: [] },
        { id: "canteen-moltke", name: "Cafeteria Moltkestraße 30", lines: [] },
      ],
    },
  };
}

function buildScreenshotBootstrapScript(theme) {
  return `<script>
(() => {
  const theme = ${JSON.stringify(theme)};
  try {
    localStorage.setItem("color-scheme", theme);
    localStorage.setItem("mensa-ka-pwa-favorites", JSON.stringify(["meal-pasta-planted"]));
  } catch {}
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) {
    meta.content = theme;
  }
  const NativeDate = Date;
  const fixedNow = new NativeDate("2026-08-19T11:30:00+02:00").getTime();
  class ScreenshotDate extends NativeDate {
    constructor(...args) {
      if (args.length === 0) {
        super(fixedNow);
      } else {
        super(...args);
      }
    }
    static now() {
      return fixedNow;
    }
  }
  ScreenshotDate.UTC = NativeDate.UTC;
  ScreenshotDate.parse = NativeDate.parse;
  window.Date = ScreenshotDate;
})();
</script>`;
}

function resolveSafePath(baseDir, requestPath) {
  const relativePath = requestPath.replace(/^\/+/, "");
  const resolved = path.resolve(baseDir, relativePath);
  const baseWithSep = baseDir.endsWith(path.sep) ? baseDir : `${baseDir}${path.sep}`;
  if (resolved !== baseDir && !resolved.startsWith(baseWithSep)) {
    return null;
  }
  return resolved;
}

async function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const host = req.headers.host || "127.0.0.1";
      const url = new URL(req.url || "/", `http://${host}`);

      if (url.pathname === "/api" || url.pathname === "/api/") {
        if (req.method === "OPTIONS") {
          res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma, X-Refresh",
          });
          res.end();
          return;
        }
        const payload = buildMockApiPayload(`http://${host}`);
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(payload));
        return;
      }

      if (url.pathname === "/mock-images/dish-1.png" || url.pathname === "/mock-images/dish-2.png") {
        const filename = path.basename(url.pathname);
        const fixturePath = resolveSafePath(FIXTURES_DIR, filename);
        if (!fixturePath || !fs.existsSync(fixturePath)) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const data = await fsp.readFile(fixturePath);
        res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" });
        res.end(data);
        return;
      }

      if (url.pathname === "/" || url.pathname === "/index.html") {
        const rawTheme = url.searchParams.get("theme");
        const theme = rawTheme === "dark" ? "dark" : "light";
        let html = await fsp.readFile(path.join(WEB_DIR, "index.html"), "utf8");
        html = html.replace(
          /<meta name="color-scheme" content="[^"]*">/,
          `<meta name="color-scheme" content="${theme}">`,
        );
        html = html.replace(
          `<script type="module" src="./app.js"></script>`,
          `${buildScreenshotBootstrapScript(theme)}\n    <script type="module" src="./app.js"></script>`,
        );
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      const filePath = resolveSafePath(WEB_DIR, decodeURIComponent(url.pathname));
      if (!filePath) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      const stat = await fsp.stat(filePath).catch(() => null);
      if (!stat || !stat.isFile()) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || "application/octet-stream";
      const fileBytes = await fsp.readFile(filePath);
      res.writeHead(200, { "Content-Type": contentType });
      res.end(fileBytes);
    } catch (error) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(error instanceof Error ? error.message : String(error));
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind ephemeral HTTP server port.");
  }
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function captureScreenshot(browserPath, url, outputPath, userDataDir) {
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    "--window-size=1140,960",
    "--force-device-scale-factor=2",
    "--virtual-time-budget=3000",
    `--user-data-dir=${userDataDir}`,
    `--screenshot=${outputPath}`,
    url,
  ];

  if (process.platform === "linux") {
    args.unshift("--no-sandbox");
  }

  await new Promise((resolve, reject) => {
    const child = spawn(browserPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Browser timed out after 45000ms for ${url}`));
    }, 45000);

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Browser exited with status ${code} for ${url}:\n${stderr || stdout}`));
      }
    });
  });
}

async function verifyScreenshot(filePath) {
  const stat = await fsp.stat(filePath).catch(() => null);
  if (!stat || stat.size === 0) {
    throw new Error(`Expected non-empty screenshot at ${filePath}`);
  }
}

async function main() {
  const browserPath = findBrowserExecutable();
  await fsp.mkdir(ASSETS_DIR, { recursive: true });
  const tempProfileDir = await fsp.mkdtemp(path.join(os.tmpdir(), "mensa-ka-screenshot-"));
  const { server, baseUrl } = await startServer();

  const lightOutput = path.join(ASSETS_DIR, "screenshot.png");
  const darkOutput = path.join(ASSETS_DIR, "screenshot-dark.png");

  try {
    await captureScreenshot(
      browserPath,
      `${baseUrl}/?theme=light`,
      lightOutput,
      path.join(tempProfileDir, "light"),
    );
    await captureScreenshot(
      browserPath,
      `${baseUrl}/?theme=dark`,
      darkOutput,
      path.join(tempProfileDir, "dark"),
    );

    await verifyScreenshot(lightOutput);
    await verifyScreenshot(darkOutput);

    console.log(`Updated ${path.relative(ROOT_DIR, lightOutput)} and ${path.relative(ROOT_DIR, darkOutput)}`);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    await fsp.rm(tempProfileDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
