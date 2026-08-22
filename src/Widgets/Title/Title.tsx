import { useTranslation } from "react-i18next";
import ExternalLink from "../../Common/Components/ExternalLink/ExternalLink";
import { Link, apexHref, useRouter } from "../../Services/router";
import { ROUTES, titleAction } from "../../Services/titleWidget";
import type { WidgetProps } from "../../Types";

/**
 * A word that goes somewhere.
 *
 * One widget for what used to be two: the app's own navigation and a link somebody added were the
 * same thing wearing different names, differing only in where they pointed.
 */
export default function Title({ widget }: WidgetProps) {
  const { t, i18n } = useTranslation();
  const { pathname } = useRouter();

  const action = titleAction(widget);
  const label = String(widget.props?.label ?? "").trim();

  if (action.kind === "external") {
    if (!action.href) return null;
    const text = label || t("title.untitled");
    return (
      <ExternalLink href={action.href} label={text} className="pivot-item pivot-item-external">
        {text}
      </ExternalLink>
    );
  }

  const route = action.kind === "route" ? ROUTES[action.route] : null;
  const path = action.kind === "path" ? action.path : route?.path;
  if (!path) return null;

  // On a profile subdomain "/" is that profile, so the app's own pages point at the apex.
  const japanese = i18n.language === "ja";
  const localised = japanese && route ? (path === "/" ? "/ja" : `${path}/ja`) : path;
  const here = (pathname.replace(/^\/users\/[^/]+/, "") || "/").toLowerCase();
  const active = route ? route.active(here) : here === path.toLowerCase();

  return (
    <Link href={apexHref(localised)} className={`pivot-item ${active ? "is-active" : ""}`.trim()}>
      {label || (route ? t(`routes.${action.kind === "route" ? action.route : ""}`) : path)}
    </Link>
  );
}
