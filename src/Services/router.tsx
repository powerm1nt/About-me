import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type AnchorHTMLAttributes,
  type ReactNode,
} from "react";

/** A history-API router in place of a routing dependency: a handful of route shapes, no nested layouts. */

interface RouterValue {
  pathname: string;
  navigate: (to: string, options?: { replace?: boolean }) => void;
}

const RouterContext = createContext<RouterValue>({
  pathname: "/",
  navigate: () => {},
});

/** Returns the handle of the current profile, parsed from subdomain or /users/:handle */
export function getSiteHandle(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const host = window.location.hostname;
  
  const match = window.location.pathname.match(/^\/users\/([^/]+)/);
  if (match) return match[1];

  const parts = host.split(".");
  if (parts.length >= 3) {
    const subdomain = parts[0];
    if (subdomain && !["www", "api", "cdn", "admin", "static", "localhost", "127"].includes(subdomain)) {
      return subdomain;
    }
  }

  return undefined;
}

export function injectHandlePrefix(path: string): string {
  const match = window.location.pathname.match(/^\/users\/([^/]+)/);
  if (match && path.startsWith("/") && !path.startsWith("/users/")) {
    return `/users/${match[1]}${path === "/" ? "" : path}`;
  }
  return path;
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((to: string, options?: { replace?: boolean }) => {
    to = injectHandlePrefix(to);
    if (options?.replace) window.history.replaceState({}, "", to);
    else window.history.pushState({}, "", to);
    setPathname(new URL(to, window.location.href).pathname);
    window.scrollTo(0, 0);
  }, []);

  const value = useMemo<RouterValue>(() => ({ pathname, navigate }), [pathname, navigate]);

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export const useRouter = (): RouterValue => useContext(RouterContext);

/** Same-origin link that navigates client-side instead of reloading the document. */
export function Link({
  href,
  onClick,
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const { navigate } = useRouter();
  const injectedHref = injectHandlePrefix(href);

  return (
    <a
      href={injectedHref}
      onClick={(e) => {
        onClick?.(e);
        // Anything but a plain left-click means "open elsewhere" — let the browser have it.
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (rest.target && rest.target !== "_self") return;
        e.preventDefault();
        navigate(injectedHref);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

/** A markdown page rendered by <FileViewer />. */
export interface PageRoute {
  kind: "page";
  /** Blob path this route renders, e.g. "posts/welcome.ja.md". */
  slug: string;
  isHome: boolean;
  japanese: boolean;
  /** True for the two blog index pages, which render <PostsIndex /> rather than an article. */
  isPostsIndex: boolean;
}

/** The photo gallery, or one photo's own page when `photoId` is set. */
export interface PhotosRoute {
  kind: "photos";
  japanese: boolean;
  photoId: string | null;
}

/** Sign in or create an account. */
export interface SignInRoute {
  kind: "signin";
  japanese: boolean;
}

export interface LandingRoute {
  kind: "landing";
  /** home = the feed, explore = outside it, about = what Hisuiki is. */
  tab: "home" | "explore" | "about";
  japanese: boolean;
}

export interface SettingsRoute {
  kind: "settings";
  japanese: boolean;
}

export type Route = PageRoute | PhotosRoute | SignInRoute | LandingRoute | SettingsRoute;

/** Ids are minted by the API as 12 hex characters; anything else is not a photo. */
/** Posts and media are addressed by UUID: a slug names a post only within one author's profile. */
const POST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Route table:
 *   /                  → README.md            /ja                  → README.ja.md
 *   /blog              → posts/index.md        /posts/ja             → posts/index.ja.md
 *   /posts/:slug        → posts/:slug.md        /posts/:slug/ja       → posts/:slug.ja.md
 *   /photos            → the gallery          /photos/ja           → the gallery, in Japanese
 *   /photos/:id        → one photo            /photos/:id/ja       → one photo, in Japanese
 *   /signin            → sign in              /signin/ja           → sign in, in Japanese
 *
 * Returns null for anything else, which renders the not-found page.
 */
export function resolveRoute(pathname: string): Route | null {
  const allSegments = pathname.replace(/\/+$/, "").split("/").filter(Boolean);

  let segments = allSegments;
  if (segments[0] === "users" && segments.length >= 2) {
    segments = segments.slice(2);
  }

  const japanese = segments[segments.length - 1] === "ja";
  const path = japanese ? segments.slice(0, -1) : segments;
  

  if (path.length === 0) {
    if (getSiteHandle()) {
      return { kind: "page", slug: "README", isHome: true, japanese, isPostsIndex: false };
    }
    return { kind: "landing", tab: "home", japanese };
  }

  if (path[0] === "posts") {
    // No index of its own: the feed on the landing page is the list of posts, so /posts is the
    // same surface rather than a second one showing the same rows in a different order.
    if (path.length === 1) {
      return { kind: "landing", tab: "home", japanese };
    }
    // Slugs are single-segment and lowercase-kebab (see the editor's slug validation).
    if (path.length === 2 && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(path[1]!)) {
      return { kind: "page", slug: path[1]!, isHome: false, japanese, isPostsIndex: false };
    }
  }

  if (path.length === 1 && (path[0] === "explore" || path[0] === "about")) {
    return { kind: "landing", tab: path[0], japanese };
  }

  if (path[0] === "signin" && path.length === 1) {
    return { kind: "signin", japanese };
  }

  if (path[0] === "settings" && path.length === 1) {
    return { kind: "settings", japanese };
  }

  // "media" is the name; "photos" stays as an alias so links already shared keep resolving.
  if (path[0] === "media" || path[0] === "photos") {
    if (path.length === 1) {
      return { kind: "photos", japanese, photoId: null };
    }
    if (path.length === 2 && POST_ID.test(path[1]!)) {
      return { kind: "photos", japanese, photoId: path[1]! };
    }
  }

  return null;
}
