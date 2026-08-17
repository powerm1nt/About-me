import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The Server API lives on a different origin in production (VITE_API_BASE_URL, baked in at build
// time). In dev it's left empty so /api/* falls through to the proxy below, which keeps the
// browser same-origin and sidesteps CORS/OAuth-return-url configuration while developing.
const devApiTarget = process.env.VITE_DEV_API_TARGET ?? "http://localhost:5066";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: devApiTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
