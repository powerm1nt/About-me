import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "copy-public-to-dist-public",
      closeBundle() {
        const publicDir = path.resolve(__dirname, "public");
        const distPublicDir = path.resolve(__dirname, "dist/public");
        if (fs.existsSync(publicDir)) {
          fs.mkdirSync(distPublicDir, { recursive: true });
          fs.cpSync(publicDir, distPublicDir, { recursive: true });
        }
      },
    },
  ],
});
