import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

try {
  execSync("npx supabase projects list --output json", {
    cwd: root,
    stdio: "pipe",
    env: process.env,
  });
} catch {
  console.error(`
Supabase CLI: no hay sesión (Access token not provided).

  1) Login con navegador (Git Bash o PowerShell en esta carpeta):
       npm run supabase:login

  2) O token manual (https://supabase.com/dashboard/account/tokens):
       export SUPABASE_ACCESS_TOKEN=sbp_...    # Git Bash
       set SUPABASE_ACCESS_TOKEN=sbp_...       # cmd
       $env:SUPABASE_ACCESS_TOKEN = "sbp_..."  # PowerShell

Luego:
       npm run supabase:link -- --project-ref jccpiuvsmgobhljavxov
       npm run supabase:deploy
`);
  process.exit(1);
}
