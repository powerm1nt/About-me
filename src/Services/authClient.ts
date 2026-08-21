import { createAuthClient } from "better-auth/react";
import { API_BASE_URL } from "./config";

/**
 * The better-auth browser client. It talks to /api/auth on the same origin — empty API_BASE_URL in
 * both development (through Vite's proxy) and production (Express serves the frontend) — which is
 * what lets the session cookie be same-site and HttpOnly with nothing for this code to hold.
 */
export const authClient = createAuthClient({
  baseURL: API_BASE_URL || window.location.origin,
});
