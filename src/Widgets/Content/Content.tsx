import { useTranslation } from "react-i18next";
import { About, FileViewer, Landing, Photos, Settings, SignIn } from "../../Modules";
import { resolveRoute, useRouter } from "../../Services/router";
import type { WidgetProps } from "../../Types";

/** Whatever the current route shows, as a widget, so the page is one tree rather than chrome plus a hole. */
export default function Content({ preview }: WidgetProps) {
  const { t } = useTranslation();
  const { pathname } = useRouter();
  const route = resolveRoute(pathname);

  // A gallery tile is not the place to mount an entire page.
  if (preview) {
    return (
      <div className="content-widget is-preview">
        <p className="content-preview-title">{t("widgets.content.label")}</p>
        <p className="content-preview-hint">{t("widgets.content.description")}</p>
      </div>
    );
  }

  if (route === null) {
    return (
      <div className="file-content">
        <h3>{t("content.notFoundTitle")}</h3>
        <p>{t("content.notFound")}</p>
      </div>
    );
  }

  if (route.kind === "landing") return <Landing tab={route.tab} />;
  if (route.kind === "photos") return <Photos photoId={route.photoId} isJapanese={route.japanese} />;
  if (route.kind === "about") return <About isJapanese={route.japanese} />;
  // A profile page is expressed by the widgets on it, so there is nothing for this to add.
  if (route.kind === "profile" || route.kind === "customize") return null;
  if (route.kind === "settings") return <Settings />;
  if (route.kind === "signin") return <SignIn isJapanese={route.japanese} />;

  return <FileViewer slug={route.slug} isHome={route.isHome} isJapanese={route.japanese} />;
}
