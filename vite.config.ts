import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

const upstreamApiBaseUrl =
  process.env.API_BASE_URL ??
  "https://futballbackend-production-ee88.up.railway.app";

// Note: this config intentionally has no Manus-platform-specific plugins
// (debug log collector, storage proxy, Manus runtime). Those only work
// inside Manus's own hosted sandbox and would 404/500 on any other machine.

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    strictPort: false,
    host: true,
    // Allow access from localhost and any LAN address (e.g. 192.168.x.x)
    // when using `--host`. Restrict this list if you deploy behind a
    // fixed domain.
    allowedHosts: true,
    proxy: {
      "/api": {
        target: upstreamApiBaseUrl,
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
