import { defineConfig } from "vite";

export default defineConfig({
  // Use "/" locally; set VITE_BASE=/kys/ for GitHub Pages production build
  base: process.env.VITE_BASE || "/",
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
