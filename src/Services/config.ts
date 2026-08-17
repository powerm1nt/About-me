// Build-time configuration. Both values are baked in by Vite from the environment at build time
// (see .env.example / the deploy workflow) rather than fetched at runtime, so the very first API
// call doesn't have to wait on a config round-trip.
//
// API_BASE_URL is deliberately empty in dev: vite's /api proxy (vite.config.ts) forwards to the
// local Server, keeping the browser same-origin so CORS and the OAuth returnUrl allow-list don't
// need a dev-specific entry.
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

export const ASSET_BASE_URL = (
  import.meta.env.VITE_ASSET_BASE_URL ?? "https://nwrks-cdn.public.prod.nuka.works/static"
).replace(/\/+$/, "");

/** Absolute URL for a Server API path, e.g. apiUrl("/api/pages?path=README.md"). */
export const apiUrl = (path: string): string =>
  `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

/** CDN/blob URL for a static asset, e.g. assetUrl("pfp.jpg"). */
export const assetUrl = (path: string): string =>
  `${ASSET_BASE_URL}/${path.replace(/^\/+/, "")}`;
