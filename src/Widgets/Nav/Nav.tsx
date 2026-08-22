import { useTranslation } from "react-i18next";
import { Link, apexHref, useRouter } from "../../Services/router";
import type { WidgetProps } from "../types";

/** The site's own pages, and how each one decides it is the page you are on. */
const TARGETS: Record<string, { path: string; active: (path: string) => boolean }> = {
  home: { path: "/", active: (path) => path === "/" || path === "/ja" },
  explore: { path: "/explore", active: (path) => path.startsWith("/explore") },
  // "photos" is still matched: it remains a route alias, so a shared link keeps highlighting Media.
  media: { path: "/media", active: (path) => /^\/(media|photos)/.test(path) },
};

/**
 * A link to one of the site's own pages.
 *
 * On a profile subdomain "/" is that person's profile, so these point at the apex instead — the feed
 * belongs to the whole site, not to whichever profile you happen to be reading.
 */
export default function Nav({ widget }: WidgetProps) {
  const { t, i18n } = useTranslation();
  const { pathname } = useRouter();

  const target = String(widget.props?.target ?? "home");
  const spec = TARGETS[target];
  if (!spec) return null;

  // A profile subdomain serves the profile at /users/:handle as well; strip it before matching so
  // the same widget highlights correctly either way.
  const activePath = (pathname.replace(/^\/users\/[^/]+/, "") || "/").toLowerCase();
  const japanese = i18n.language === "ja";
  const suffix = japanese ? (spec.path === "/" ? "/ja" : `${spec.path}/ja`) : spec.path;

  return (
    <Link
      href={apexHref(suffix)}
      className={`pivot-item ${spec.active(activePath) ? "is-active" : ""}`.trim()}
    >
      {t(`nav.${target}`)}
    </Link>
  );
}
