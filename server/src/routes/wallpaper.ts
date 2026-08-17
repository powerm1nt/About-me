import { Router } from "express";
import { getToday } from "../services/bing.js";

export const wallpaperRouter = Router();

/**
 * `no-store`, deliberately: these routes are also reachable by a direct top-level navigation (no
 * Origin header), and a shared/public cache entry created from that request would be replayed for
 * later cross-origin fetches — without an Access-Control-Allow-Origin header, since CORS only adds
 * one when the request actually carries an Origin. The 1h server-side cache in the Bing service
 * already covers freshness, so browser caching isn't needed and isn't worth that risk.
 */
const CACHE_CONTROL = "no-store";

/**
 * GET /api/wallpaper/bing — today's Bing "picture of the day" metadata. `imageUrl` points back at
 * the route below rather than bing.com directly, so the client can sample it into a canvas without
 * a cross-origin taint.
 */
wallpaperRouter.get("/bing", async (req, res, next) => {
  try {
    const entry = await getToday();
    if (!entry) {
      res.status(502).json({ error: "Could not fetch today's Bing wallpaper." });
      return;
    }

    res.setHeader("Cache-Control", CACHE_CONTROL);
    res.json({
      imageUrl: `${req.protocol}://${req.get("host")}/api/wallpaper/bing/image`,
      title: entry.title,
      copyright: entry.copyright,
      date: entry.date,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/wallpaper/bing/image — the actual bytes, from the same cached entry as above.
wallpaperRouter.get("/bing/image", async (_req, res, next) => {
  try {
    const entry = await getToday();
    if (!entry) {
      res.status(502).json({ error: "Could not fetch today's Bing wallpaper." });
      return;
    }

    res.setHeader("Cache-Control", CACHE_CONTROL);
    res.type(entry.contentType).send(entry.imageBytes);
  } catch (error) {
    next(error);
  }
});
