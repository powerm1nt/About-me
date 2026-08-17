import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiUrl } from "./config";
import { SESSION_HEADER } from "./api";
import type { AuthUser } from "./types";

/**
 * Tracks the visitor's GitHub sign-in state for the "propose changes" flow. The actual GitHub
 * access token never reaches the browser — only an opaque session id (persisted to localStorage)
 * that Server maps back to the token server-side.
 */

const STORAGE_KEY = "proposal-session";

/** Action the OAuth callback asked to resume once the user lands back here. */
export type ResumeAction = "edit" | "create" | null;

interface InitialAuth {
  sessionId: string | null;
  resume: ResumeAction;
}

/**
 * Consumes the OAuth callback's `?session=` / `?resume=` params: stores the session, strips the
 * params from the URL, and reports what the callback asked to resume. Falls back to a previously
 * saved session when the URL carries none.
 *
 * Deliberately at module scope rather than inside the component: this must happen exactly once
 * per page load, and every in-component equivalent (a ref, a lazy `useState` initializer) is
 * re-entered by StrictMode's double-invoke — at which point the params are already stripped and
 * the resume action is silently lost.
 */
const initialAuth: InitialAuth = (() => {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("session");

  if (!fromUrl) {
    return { sessionId: localStorage.getItem(STORAGE_KEY), resume: null };
  }

  const resume = params.get("resume");
  localStorage.setItem(STORAGE_KEY, fromUrl);
  window.history.replaceState({}, "", window.location.pathname);

  return {
    sessionId: fromUrl,
    resume: resume === "edit" || resume === "create" ? resume : null,
  };
})();

interface AuthValue {
  user: AuthUser | null;
  isSignedIn: boolean;
  sessionId: string | null;
  /** Set from the callback's `?resume=` param; read by whichever component owns that action. */
  resumeAction: ResumeAction;
  /** True until the stored session (if any) has been checked against /api/auth/me. */
  initializing: boolean;
  redirectToLogin: (resume?: Exclude<ResumeAction, null>) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue>({
  user: null,
  isSignedIn: false,
  sessionId: null,
  resumeAction: null,
  initializing: true,
  redirectToLogin: () => {},
  logout: async () => {},
});

async function fetchMe(sessionId: string): Promise<AuthUser | null> {
  try {
    const response = await fetch(apiUrl("/api/auth/me"), {
      headers: { [SESSION_HEADER]: sessionId },
    });
    return response.ok ? ((await response.json()) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState<string | null>(initialAuth.sessionId);
  const [user, setUser] = useState<AuthUser | null>(null);
  // Only "initializing" when there's actually a stored session to verify — with none, the answer
  // (signed out) is already known and nothing has to be awaited.
  const [initializing, setInitializing] = useState(initialAuth.sessionId !== null);

  useEffect(() => {
    if (!sessionId) return;

    let active = true;
    void fetchMe(sessionId).then((me) => {
      if (!active) return;
      setUser(me);
      setInitializing(false);
    });

    return () => {
      active = false;
    };
  }, [sessionId]);

  // A full-page redirect, not a client-side navigation: the OAuth dance leaves and re-enters the
  // site. `resume` tells the callback which action to pick back up when it returns.
  const redirectToLogin = useCallback((resume?: Exclude<ResumeAction, null>) => {
    const returnUrl = encodeURIComponent(window.location.href);
    const resumeParam = resume ? `&resume=${encodeURIComponent(resume)}` : "";
    window.location.href = apiUrl(`/api/auth/github/login?returnUrl=${returnUrl}${resumeParam}`);
  }, []);

  const logout = useCallback(async () => {
    if (sessionId) {
      try {
        await fetch(apiUrl("/api/auth/logout"), {
          method: "POST",
          headers: { [SESSION_HEADER]: sessionId },
        });
      } catch {
        // best-effort — the local session is dropped either way
      }
    }
    localStorage.removeItem(STORAGE_KEY);
    setSessionId(null);
    setUser(null);
  }, [sessionId]);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      isSignedIn: user !== null,
      sessionId,
      resumeAction: initialAuth.resume,
      initializing,
      redirectToLogin,
      logout,
    }),
    [user, sessionId, initializing, redirectToLogin, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = (): AuthValue => useContext(AuthContext);
