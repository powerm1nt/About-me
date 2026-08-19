import express, { type NextFunction, type Request, type Response } from "express";
import path from "node:path";
import { config } from "./config.js";
import { SESSION_HEADER } from "./services/sessions.js";
import { pagesRouter } from "./routes/pages.js";
import { authRouter } from "./routes/auth.js";
import { proposalsRouter } from "./routes/proposals.js";
import { wallpaperRouter } from "./routes/wallpaper.js";

const app = express();

// Cloud Run terminates TLS at the edge, so without this req.protocol reports "http" and the OAuth
// redirect_uri stops matching the callback registered with GitHub.
app.set("trust proxy", 1);

app.use(express.json({ limit: "1mb" }));

/**
 * Hand-rolled CORS: a fixed origin allow-list plus one custom header. Requests without an Origin
 * get no CORS headers at all, which the wallpaper routes' no-store depends on.
 */
app.use((req, res, next) => {
  const origin = req.header("origin");

  if (origin && config.allowedOrigins.includes(origin.replace(/\/+$/, ""))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    // Per-origin allow-list, so caches must key on Origin.
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", `Content-Type,${SESSION_HEADER}`);
  }

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
});

// Cloud CDN uses origin headers for this backend. Dynamic and authenticated endpoints are private
// unless an individual public GET route opts into caching with a more specific response header.
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  next();
});

app.use("/api/pages", pagesRouter);
app.use("/api/auth", authRouter);
app.use("/api/proposals", proposalsRouter);
app.use("/api/wallpaper", wallpaperRouter);

// Production images include the Vite build at WEB_ROOT. API routes are mounted first so an
// unknown /api request still returns JSON instead of falling through to the client-side app.
const webRoot = process.env.WEB_ROOT?.trim();
if (webRoot) {
  app.use(
    express.static(webRoot, {
      index: false,
      setHeaders: (res, filePath) => {
        const relativePath = path.relative(webRoot, filePath).replaceAll(path.sep, "/");

        if (relativePath.startsWith("assets/")) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else if (relativePath === "index.html" || relativePath === "version.json") {
          res.setHeader("Cache-Control", "no-cache, max-age=0, must-revalidate");
        } else {
          res.setHeader("Cache-Control", "public, max-age=3600");
        }
      },
    })
  );

  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) {
      next();
      return;
    }

    res.setHeader("Cache-Control", "no-cache, max-age=0, must-revalidate");
    res.sendFile(path.join(webRoot, "index.html"), (error) => {
      if (error) next(error);
    });
  });
} else {
  /** Local API health response when no frontend build is mounted. */
  app.get("/", (_req, res) => {
    res.json({ status: "ok" });
  });
}

app.use((_req, res) => {
  res.status(404).json({ error: "Not found." });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error:", error);
  res.status(500).json({ error: "Internal server error." });
});

app.listen(config.port, () => {
  console.log(`API listening on port ${config.port}`);
  if (!config.storage.bucketName) {
    console.warn("GCS_BUCKET is not set — every page read will fail until it is.");
  }
});
