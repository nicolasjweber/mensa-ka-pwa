import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

if (!fs.existsSync(path.join(rootDir, ".git"))) {
  process.exit(0);
}

spawnSync("git", ["config", "core.hooksPath", ".githooks"], {
  cwd: rootDir,
  stdio: "ignore",
});
