import express, { type NextFunction, type Request, type Response } from "express";
import { config } from "./config.js";
import { SESSION_HEADER } from "./services/sessions.js";
import { pagesRouter } from "./routes/pages.js";
import { authRouter } from "./routes/auth.js";
import { proposalsRouter } from "./routes/proposals.js";
import { wallpaperRouter } from "./routes/wallpaper.js";

const app = express();

// Cloud Run terminates TLS at the edge and forwards over plain HTTP behind one proxy hop. Without
// this, req.protocol reports "http" and the OAuth redirect_uri we hand GitHub would not match the
// https callback registered on the OAuth app.
app.set("trust proxy", 1);

app.use(express.json({ limit: "1mb" }));

/**
 * CORS, hand-rolled rather than pulled from a package: the policy is a fixed allow-list of origins
 * plus one custom header, which is small enough that a dependency would be more surface than
 * substance. Requests without an Origin (curl, a top-level navigation) get no CORS headers at all,
 * which is exactly what the wallpaper routes' no-store comment depends on.
 */
app.use((req, res, next) => {
  const origin = req.header("origin");

  if (origin && config.allowedOrigins.includes(origin.replace(/\/+$/, ""))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    // The allow-list is per-origin, so caches must key on Origin or one origin's response would be
    // replayed for another.
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

app.use("/api/pages", pagesRouter);
app.use("/api/auth", authRouter);
app.use("/api/proposals", proposalsRouter);
app.use("/api/wallpaper", wallpaperRouter);

/** Cloud Run's default health probe hits "/" — answer it without falling through to the 404 below. */
app.get("/", (_req, res) => {
  res.json({ status: "ok" });
});

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
