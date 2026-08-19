import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Frontend and API share an origin in production. In development, /api/* falls through to the
// proxy below so the browser keeps that same-origin contract while Express runs on its own port.
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
