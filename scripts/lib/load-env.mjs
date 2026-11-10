import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function applyEnvFile(filePath) {
  if (!existsSync(filePath)) return false;
  const text = readFileSync(filePath, "utf8");
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
  return true;
}

/** Loads DATABASE_URL from repo-root .env / .env.local (never committed). */
export function loadDatabaseUrlFromEnvFiles(cwd = process.cwd()) {
  const root = resolve(cwd);
  const candidates = [resolve(root, ".env.local"), resolve(root, ".env")];
  for (const p of candidates) applyEnvFile(p);
}

export function missingDatabaseUrlHelp() {
  return `DATABASE_URL not set.

1) Supabase Dashboard → Project Settings → Database → Connection string → URI
   (Session pooler, port 5432 — user postgres.[project-ref]. Encode * @ # in password.)

2) Create ${resolve(process.cwd(), ".env")} in the project root (gitignored):

   DATABASE_URL=postgresql://postgres.[ref]:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres

   On Windows/Git Bash, avoid db.[ref].supabase.co (IPv6-only → getaddrinfo ENOENT).

   Or one-off in PowerShell:
   $env:DATABASE_URL = "postgresql://..."

3) Re-run: npm run import:db-ks -- --wipe --file DB-KS.csv`;
}
