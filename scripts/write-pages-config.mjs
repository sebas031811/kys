import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontendDir = path.join(root, "frontend");
const publicDir = path.join(frontendDir, "public");
mkdirSync(publicDir, { recursive: true });

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

const fileEnv = {
  ...loadEnvFile(path.join(frontendDir, ".env")),
  ...loadEnvFile(path.join(frontendDir, ".env.local")),
  ...loadEnvFile(path.join(frontendDir, ".env.production")),
};

function pickEnv(...keys) {
  for (const key of keys) {
    if (process.env[key]) return process.env[key];
    if (fileEnv[key]) return fileEnv[key];
  }
  return "";
}

const configPath = path.join(publicDir, "config.json");
let committed = {};
if (existsSync(configPath)) {
  try {
    committed = JSON.parse(readFileSync(configPath, "utf8"));
  } catch {
    committed = {};
  }
}

const config = {
  supabaseUrl:
    pickEnv("VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL") || committed.supabaseUrl || "",
  supabaseKey:
    pickEnv(
      "VITE_SUPABASE_PUBLISHABLE_KEY",
      "VITE_SUPABASE_ANON_KEY",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ) ||
    committed.supabaseKey ||
    "",
  functionName: pickEnv("VITE_SUPABASE_FUNCTION") || committed.functionName || "kys-api",
};

writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

if (!config.supabaseUrl || !config.supabaseKey) {
  console.warn(
    "Pages build: sin URL/clave Supabase (env ni frontend/public/config.json).",
  );
}
