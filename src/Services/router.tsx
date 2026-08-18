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

/** A history-API router in place of a routing dependency: five route shapes, no nested layouts. */

interface RouterValue {
  pathname: string;
  navigate: (to: string, options?: { replace?: boolean }) => void;
}

const RouterContext = createContext<RouterValue>({
  pathname: "/",
  navigate: () => {},
});

export function RouterProvider({ children }: { children: ReactNode }) {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((to: string, options?: { replace?: boolean }) => {
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

  return (
    <a
      href={href}
      onClick={(e) => {
        onClick?.(e);
        // Anything but a plain left-click means "open elsewhere" — let the browser have it.
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (rest.target && rest.target !== "_self") return;
        e.preventDefault();
        navigate(href);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

export interface Route {
  /** Blob path this route renders, e.g. "blog/welcome.ja.md". */
  filePath: string;
  japanese: boolean;
  /** True for the two blog index pages, which render <BlogIndex /> rather than an article. */
  isBlogIndex: boolean;
}

/**
 * Route table:
 *   /                  → README.md            /ja                  → README.ja.md
 *   /blog              → blog/index.md        /blog/ja             → blog/index.ja.md
 *   /blog/:slug        → blog/:slug.md        /blog/:slug/ja       → blog/:slug.ja.md
 *
 * Returns null for anything else, which renders the not-found page.
 */
export function resolveRoute(pathname: string): Route | null {
  const segments = pathname.replace(/\/+$/, "").split("/").filter(Boolean);

  const japanese = segments[segments.length - 1] === "ja";
  const path = japanese ? segments.slice(0, -1) : segments;
  const suffix = japanese ? ".ja.md" : ".md";

  if (path.length === 0) {
    return { filePath: `README${suffix}`, japanese, isBlogIndex: false };
  }

  if (path[0] === "blog") {
    if (path.length === 1) {
      return { filePath: `blog/index${suffix}`, japanese, isBlogIndex: true };
    }
    // Slugs are single-segment and lowercase-kebab (see the editor's slug validation).
    if (path.length === 2 && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(path[1]!)) {
      return { filePath: `blog/${path[1]}${suffix}`, japanese, isBlogIndex: false };
    }
  }

  return null;
}
