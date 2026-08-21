import { useEffect } from "react";
import AppModal from "./Common/Components/AppModal/AppModal";
import Wallpaper from "./Common/Components/Wallpaper/Wallpaper";
import { FileViewer, Footer, Header, Landing, Photos, Settings, SignIn } from "./Modules";
import { AuthProvider } from "./Services/auth";
import { ExternalLinkProvider } from "./Services/externalLink";
import { RouterProvider, resolveRoute, useRouter } from "./Services/router";
import { injectAssetCssVariables } from "./Services/wallpaper";
import { apiUrl } from "./Services/config";
import { getSiteHandle } from "./Services/router";

function pageTitle(pathname: string): string {
  const route = resolveRoute(pathname);
  if (!route) return "Not found — Hisuiki";
  if (route.kind === "landing") return "Hisuiki";
  if (route.kind === "photos") {
    return route.photoId ? "Photo — Hisuiki" : "Photos — Hisuiki";
  }
  if (route.kind === "signin") return "Sign in — Hisuiki";
  if (route.kind === "settings") return "Settings — Hisuiki";
  if (route.isPostsIndex) return "Posts — Hisuiki";
  if ((!route.isHome && route.slug !== "posts-index")) {
    const slug = route.slug;
    return `${slug} — Hisuiki`;
  }
  return "Hisuiki";
}

function NotFound() {
  return (
    <main className="main-content">
      <div className="main-content-container">
        <div className="file-content">
          <h3>Not Found</h3>
          <p>Sorry, the content you are looking for does not exist.</p>
        </div>
      </div>
    </main>
  );
}

function Shell() {
  const { pathname } = useRouter();
  const route = resolveRoute(pathname);

  useEffect(() => {
    document.title = pageTitle(pathname);
  }, [pathname]);

  // The container a profile's stylesheet is scoped to on the server. It deliberately wraps the
  // content and not <Header />, so a profile can restyle its own pages but never the app chrome it
  // shares with everyone else.
  const isProfileSite = getSiteHandle() !== null;

  return (
    <>
      <Wallpaper />
      <Header isJapanese={route?.japanese ?? false} />
      <div className={isProfileSite ? "profile-custom" : undefined}>
      {route === null ? (
        <NotFound />
      ) : route.kind === "landing" ? (
        <main className="main-content">
          <div className="main-content-container">
            <Landing isJapanese={route.japanese} />
          </div>
        </main>
      ) : route.kind === "photos" ? (
        <Photos photoId={route.photoId} isJapanese={route.japanese} />
      ) : route.kind === "settings" ? (
        <main className="main-content">
          <div className="main-content-container">
            <Settings isJapanese={route.japanese} />
          </div>
        </main>
      ) : route.kind === "signin" ? (
        <main className="main-content">
          <div className="main-content-container">
            <div className="file-content" data-phase="ready">
              <SignIn isJapanese={route.japanese} />
            </div>
          </div>
        </main>
      ) : (
        <FileViewer slug={route.slug} isHome={route.isHome} isJapanese={route.japanese} />
      )}
      </div>
      <Footer />
      <AppModal />
    </>
  );
}

export default function App() {

  // A profile subdomain's own styling. The API returns `scopedCss` — already filtered and confined
  // to .profile-custom on the server — and never the author's raw source, so nothing here can
  // restyle the app chrome or another person's content. The <style> element is removed on cleanup
  // so navigating between profiles does not stack stylesheets.
  useEffect(() => {
    const handle = getSiteHandle();
    if (!handle) return;

    let style: HTMLStyleElement | null = null;
    let cancelled = false;

    fetch(apiUrl(`/api/profile/${handle}`))
      .then((res) => (res.ok ? res.json() : null))
      .then((profile: { scopedCss?: string; accentColor?: string } | null) => {
        if (!profile || cancelled) return;

        if (profile.scopedCss?.trim()) {
          style = document.createElement("style");
          style.dataset.profileCss = handle;
          style.textContent = profile.scopedCss;
          document.head.appendChild(style);
        }
        if (profile.accentColor) {
          document.documentElement.style.setProperty("--color-accent", profile.accentColor);
        }
      })
      .catch(() => {
        // A profile that will not load is not worth breaking the page over; the default styling
        // stays in place.
      });

    return () => {
      cancelled = true;
      style?.remove();
    };
  }, []);

  // <Wallpaper /> fetches and shows the photo itself; only the asset paths are left here.
  useEffect(() => {
    injectAssetCssVariables();
  }, []);

  return (
    <RouterProvider>
      <AuthProvider>
        <ExternalLinkProvider>
          <Shell />
        </ExternalLinkProvider>
      </AuthProvider>
    </RouterProvider>
  );
}
