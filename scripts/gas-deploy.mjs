import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const appDir = path.join(root, "google", "kys-app");
const deploymentId = process.env.KYS_CLASP_DEPLOYMENT_ID;

if (!deploymentId) {
  console.error("Set KYS_CLASP_DEPLOYMENT_ID to your web app deployment ID (Deploy → Manage deployments).");
  process.exit(1);
}

execSync(`node scripts/run-clasp.mjs deploy -i ${deploymentId} -d "KYS web app"`, {
  cwd: root,
  stdio: "inherit",
  shell: true,
});
