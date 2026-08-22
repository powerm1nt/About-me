import { useEffect, useState } from "react";
import AnchorRegion from "./Common/Components/AnchorRegion/AnchorRegion";
import AppModal from "./Common/Components/AppModal/AppModal";
import SaveIndicator from "./Common/Components/SaveIndicator/SaveIndicator";
import Wallpaper from "./Common/Components/Wallpaper/Wallpaper";
import WidgetGallery from "./Common/Components/WidgetGallery/WidgetGallery";
import { About, FileViewer, Profile, Landing, Photos, Settings, SignIn } from "./Modules";
import { AuthProvider, useAuth } from "./Services/auth";
import { PageLayoutProvider, usePageLayout } from "./Services/pageLayout";
import { addWidget } from "./Services/layout";
import type { WidgetKind } from "./Types";
import { setLanguage } from "./Services/i18n";
import { ExternalLinkProvider } from "./Services/externalLink";
import { RouterProvider, resolveRoute, useRouter } from "./Services/router";
import { fetchMyProfile } from "./Services/profile";
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
  if (route.kind === "customize") return "Customize — Hisuiki";
  if (route.kind === "about") return "About — Hisuiki";
  if (route.kind === "profile") return `@${route.handle} — Hisuiki`;
  if (route.isPostsIndex) return "Posts — Hisuiki";
  if (!route.isHome) return `${route.slug} — Hisuiki`;
  return "Hisuiki";
}

/**
 * The signed-in person's own profile, opened for arranging. It resolves the handle from the session
 * rather than the URL, so /customize needs no handle in it and cannot be pointed at someone else.
 */
function CustomizeOwnProfile() {
  const auth = useAuth();
  const [handle, setHandle] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!auth.isSignedIn) return;

    let active = true;
    fetchMyProfile()
      .then((profile) => {
        if (!active) return;
        if (profile.handle) setHandle(profile.handle);
        else setMissing(true);
      })
      .catch(() => {
        if (active) setMissing(true);
      });

    return () => {
      active = false;
    };
  }, [auth.isSignedIn]);

  if (!auth.isSignedIn) {
    return <p className="loading-text">{"Sign in to customize your profile."}</p>;
  }

  // Without a handle there is no profile to arrange yet, and settings is where one is chosen.
  if (missing) {
    return (
      <p className="loading-text">
        {"Choose a handle in Settings first."}
      </p>
    );
  }

  if (!handle) return <p className="loading-text">…</p>;

  return <Profile handle={handle} editing />;
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

/**
 * The page's furniture, drawn from the layout document rather than from this file.
 *
 * There is no <Header /> and no <Footer /> any more. The top anchor holds a container of navigation
 * widgets and the bottom one holds the brand and colophon, and either can be emptied, refilled or
 * swapped with the other — nothing here knows which is which. The route still decides what goes in
 * the middle, because that is what a route is for.
 */
function Shell() {
  const { pathname } = useRouter();
  const route = resolveRoute(pathname);
  const { editing, anchors, setAnchor } = usePageLayout();

  useEffect(() => {
    document.title = pageTitle(pathname);
  }, [pathname]);

  // Language is ambient rather than a prop on every component: a widget is placed by its owner and
  // rendered by whichever surface it lands in, so it cannot rely on a prop being threaded down a
  // path nobody controls.
  useEffect(() => {
    setLanguage(route?.japanese ? "ja" : "en");
  }, [route?.japanese]);

  // The container a profile's stylesheet is scoped to on the server. It deliberately wraps the
  // content and not the top anchor, so a profile can restyle its own pages but never the app chrome
  // it shares with everyone else.
  const isProfileSite = getSiteHandle() !== null;

  return (
    <>
      <Wallpaper />

      <header className="page-top">
        <div className="page-rail">
          <AnchorRegion anchor="top" />
        </div>
      </header>

      {/* The gallery belongs to the page, not to the profile: with the header and footer arrangeable
          too, it has to be reachable while arranging any of them. */}
      {editing && (
        <div className="page-rail">
          <WidgetGallery onAdd={(kind: WidgetKind) => setAnchor("center", addWidget(anchors.center, kind))} />
          <SaveIndicator />
        </div>
      )}

      <div className="page-middle">
        <AnchorRegion anchor="left" className="page-side" />

        <div className={isProfileSite ? "profile-custom" : undefined}>
      {route === null ? (
        <NotFound />
      ) : route.kind === "landing" ? (
        <main className="main-content">
          <div className="main-content-container">
            <Landing isJapanese={route.japanese} tab={route.tab} />
          </div>
        </main>
      ) : route.kind === "photos" ? (
        <Photos photoId={route.photoId} isJapanese={route.japanese} />
      ) : route.kind === "about" ? (
        <main className="main-content">
          <div className="main-content-container">
            <div className="file-content" data-phase="ready">
              <About isJapanese={route.japanese} />
            </div>
          </div>
        </main>
      ) : route.kind === "profile" ? (
        <main className="main-content">
          <div className="main-content-container">
            <div className="file-content" data-phase="ready" key={route.handle}>
              <Profile handle={route.handle} />
            </div>
          </div>
        </main>
      ) : route.kind === "customize" ? (
        // Customizing is the page in edit mode, not a separate screen — the thing being arranged is
        // the page itself.
        <main className="main-content">
          <div className="main-content-container">
            <div className="file-content" data-phase="ready">
              <CustomizeOwnProfile />
            </div>
          </div>
        </main>
      ) : route.kind === "settings" ? (
        <main className="main-content">
          <div className="main-content-container">
            <Settings />
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

        <AnchorRegion anchor="right" className="page-side" />
      </div>

      <footer className="page-bottom">
        <div className="page-rail">
          <AnchorRegion anchor="bottom" />
        </div>
      </footer>

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
        <PageLayoutProvider>
          <ExternalLinkProvider>
            <Shell />
          </ExternalLinkProvider>
        </PageLayoutProvider>
      </AuthProvider>
    </RouterProvider>
  );
}
