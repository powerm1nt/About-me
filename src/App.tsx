import { useEffect } from "react";
import AppModal from "./Common/Components/AppModal/AppModal";
import { FileViewer, Footer, Header } from "./Modules";
import { AuthProvider } from "./Services/auth";
import { ExternalLinkProvider } from "./Services/externalLink";
import { RouterProvider, resolveRoute, useRouter } from "./Services/router";
import { applyWallpaper } from "./Services/palette";
import { injectAssetCssVariables, resolveWallpaperUrl } from "./Services/wallpaper";

function pageTitle(pathname: string): string {
  const route = resolveRoute(pathname);
  if (!route) return "Not found — powerm1nt";
  if (route.isBlogIndex) return "Blog — powerm1nt";
  if (route.filePath.startsWith("blog/")) {
    const slug = route.filePath.slice("blog/".length).replace(/(\.ja)?\.md$/, "");
    return `${slug} — powerm1nt`;
  }
  return "Emi — powerm1nt";
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

  return (
    <>
      <Header isJapanese={route?.japanese ?? false} />
      {route ? (
        <FileViewer filePath={route.filePath} isJapanese={route.japanese} />
      ) : (
        <NotFound />
      )}
      <Footer />
      <AppModal />
    </>
  );
}

export default function App() {
  // Today's Bing wallpaper (falls back to the bundled static image if Server/Bing is
  // unreachable). applyWallpaper is safe to call again later too — e.g. from a future appearance
  // picker — re-deriving the whole accent/text palette each time.
  useEffect(() => {
    injectAssetCssVariables();
    void resolveWallpaperUrl().then(applyWallpaper);
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
