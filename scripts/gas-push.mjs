import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

execSync("npm run build --prefix frontend", { cwd: root, stdio: "inherit", shell: true });
execSync("node scripts/run-clasp.mjs push", { cwd: root, stdio: "inherit", shell: true });
