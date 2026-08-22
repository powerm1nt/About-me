import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { WIDGETS, galleryKinds, newId } from "../../../Services/layout";
import { fetchFeed } from "../../../Services/api";
import { fetchProfile, fetchMyProfile } from "../../../Services/profile";
import { DRAG_TYPE } from "../../../Services/widgetDrag";
import type { ProfileScope, Widget, WidgetGalleryProps, WidgetKind } from "../../../Types";
import { ProfileScopeProvider, WIDGET_REGISTRY } from "../../../Widgets";
import { galleryScope } from "../../../Widgets/demo";

const STORAGE_KEY = "hisuiki.gallery.open";

type Props = Record<string, string | number | boolean>;

/** Stand-in settings where a widget would otherwise be blank until configured. */
function sample(kind: WidgetKind, t: (key: string) => string): Widget {
  const props: Partial<Record<WidgetKind, Props>> = {
    title: { action: "route", route: "home" },
    text: { heading: t("text.sampleHeading"), body: t("text.sampleBody") },
    webamp: { title: t("gallery.sample.track") },
  };

  return {
    id: `gallery-${newId()}`,
    kind,
    size: WIDGETS[kind].defaultSize,
    props: props[kind] ?? {},
    children: WIDGETS[kind].container ? [] : undefined,
  };
}

/**
 * The shelf a page is built from. Each tile is the real widget, filled with this profile's own
 * content where it has any, and dragged onto whichever anchor it should live at.
 */
export default function WidgetGallery({ onAdd }: WidgetGalleryProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const [open, setOpen] = useState(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY) !== "false";
    } catch {
      return true;
    }
  });

  const [real, setReal] = useState<ProfileScope | null>(null);

  useEffect(() => {
    if (!open) return;

    let active = true;
    void fetchMyProfile()
      .then(async (mine) => {
        if (!mine.handle) return null;
        const [profile, posts] = await Promise.all([
          fetchProfile(mine.handle),
          fetchFeed({ author: mine.handle, sort: "recent" }),
        ]);
        const readme = posts.find((post) => post.slug === "README" || post.title === "README") ?? null;
        return {
          profile,
          posts,
          readme,
          timeline: posts.filter((post) => post.id !== readme?.id),
          handle: mine.handle,
        } satisfies ProfileScope;
      })
      .then((scope) => {
        if (active && scope) setReal(scope);
      })
      .catch(() => {
        // Not signed in, or no profile yet. The sample content stands.
      });

    return () => {
      active = false;
    };
  }, [open]);

  const scope = useMemo(() => galleryScope(real), [real]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Collapses for this visit; just not remembered.
    }
  };

  const needle = query.trim().toLowerCase();
  const kinds = galleryKinds().filter((kind) => {
    if (!needle) return true;
    const label = t(`widgets.${kind}.label`).toLowerCase();
    const description = t(`widgets.${kind}.description`).toLowerCase();
    return label.includes(needle) || description.includes(needle) || kind.includes(needle);
  });

  return (
    <section className="widget-gallery" aria-label={t("gallery.title")}>
      <div className="widget-gallery-bar">
        <button type="button" className="widget-gallery-toggle" aria-expanded={open} onClick={toggle}>
          <span className="widget-gallery-caret" aria-hidden="true">{open ? "▾" : "▸"}</span>
          {t("gallery.title")}
        </button>

        {open && (
          <input
            type="search"
            className="widget-gallery-search"
            value={query}
            placeholder={t("gallery.search")}
            aria-label={t("gallery.search")}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
      </div>

      {open && (
        <ProfileScopeProvider value={scope}>
          {kinds.length === 0 ? (
            <p className="inspector-note">{t("gallery.noMatch")}</p>
          ) : (
            <ul className="widget-gallery-grid">
              {kinds.map((kind) => {
                const View = WIDGET_REGISTRY[kind];
                const label = t(`widgets.${kind}.label`);

                return (
                  <li
                    className="widget-card"
                    key={kind}
                    data-widget={kind}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ kind }));
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                  >
                    {/* inert: a preview holds real links and real buttons. */}
                    <div className="widget-card-preview" inert aria-hidden="true">
                      <View widget={sample(kind, t)} editing={false} preview onChange={() => {}} />
                    </div>

                    {/* Also a button, so the shelf is not pointer-only. */}
                    <button
                      type="button"
                      className="widget-card-button"
                      aria-label={`${t("gallery.add")}: ${label}`}
                      onClick={() => onAdd(kind)}
                    >
                      <span className="widget-card-name">{label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ProfileScopeProvider>
      )}
    </section>
  );
}
