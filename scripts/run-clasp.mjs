import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const claspBin = path.join(root, "node_modules", ".bin", "clasp");
const appDir = path.join(root, "google", "kys-app");
const args = process.argv.slice(2);

if (!fs.existsSync(claspBin) && !fs.existsSync(claspBin + ".cmd")) {
  console.error("clasp is not installed.\n");
  console.error("From the repo root run:\n  npm install\n");
  console.error("Then:\n  npm run gas:login\n  npm run gas:push");
  process.exit(1);
}

const cwd = args[0] === "login" ? root : appDir;
const claspArgs = args[0] === "login" ? args : args;

const cmd = process.platform === "win32" ? `"${claspBin}.cmd" ${claspArgs.join(" ")}` : `"${claspBin}" ${claspArgs.join(" ")}`;

execSync(cmd, { cwd, stdio: "inherit", shell: true, env: process.env });
