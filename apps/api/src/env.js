import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

function loadFile(file) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadFile(path.resolve(repoRoot, ".env"));
loadFile(path.resolve(here, "../.env"));
loadFile(path.resolve(process.cwd(), ".env"));

export const PORT = Number(process.env.PORT || 8787);
export const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || "tennisapi1.p.rapidapi.com";
export const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || "";
export const CORS_ORIGIN = process.env.CORS_ORIGIN || "";
export const ANTHROPIC_API_KEY =
  process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || process.env.CALUDE_API_KEY || "";
export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
export const WEB_DIST = path.resolve(repoRoot, process.env.WEB_DIST || "apps/web/dist");
