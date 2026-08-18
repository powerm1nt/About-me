/** Maps the opaque session id in X-Proposal-Session to a GitHub token that never leaves the server. */
import { randomBytes } from "node:crypto";
import { TtlCache } from "./cache.js";

export const SESSION_HEADER = "x-proposal-session";

export interface AuthSession {
  accessToken: string;
  login: string;
  avatarUrl: string;
  name: string;
}

/** Where the OAuth flow should send the browser back to once GitHub returns. */
export interface PendingLogin {
  returnUrl: string;
  resume: string | null;
}

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const STATE_TTL_MS = 5 * 60 * 1000;

const sessions = new TtlCache<AuthSession>(SESSION_TTL_MS, 10_000);
const states = new TtlCache<PendingLogin>(STATE_TTL_MS, 10_000);

/** CSPRNG, not Math.random: this id is all that guards someone else's GitHub token. */
const newId = (): string => randomBytes(16).toString("hex");

export function createSession(session: AuthSession): string {
  const id = newId();
  sessions.set(id, session);
  return id;
}

export function getSession(sessionId: string | undefined): AuthSession | undefined {
  if (!sessionId) return undefined;
  return sessions.get(sessionId);
}

export function removeSession(sessionId: string | undefined): void {
  if (sessionId) sessions.delete(sessionId);
}

export function createState(pending: PendingLogin): string {
  const state = newId();
  states.set(state, pending);
  return state;
}

/** States are single-use: consuming one removes it, so a callback can't be replayed. */
export function consumeState(state: string | undefined): PendingLogin | undefined {
  if (!state) return undefined;
  const pending = states.get(state);
  if (pending) states.delete(state);
  return pending;
}
