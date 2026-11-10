import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(rootDir, "..");

export default defineConfig({
  base: "./",
  server: { port: 5173 },
  resolve: {
    alias: {
      "@kys/shared": path.join(repoRoot, "shared"),
    },
  },
});
