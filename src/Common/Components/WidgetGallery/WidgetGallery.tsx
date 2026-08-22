import { useState } from "react";
import { useTranslation } from "react-i18next";
import { WIDGETS, galleryKinds, newId } from "../../../Services/layout";
import type { Widget, WidgetKind } from "../../../Services/profile";
import { ProfileScopeProvider, WIDGET_REGISTRY } from "../../../Widgets";
import { DEMO_SCOPE } from "../../../Widgets/demo";

export interface WidgetGalleryProps {
  onAdd: (kind: WidgetKind) => void;
}

const STORAGE_KEY = "hisuiki.gallery.open";

type Props = Record<string, string | number | boolean>;

/**
 * Enough of a widget to render one, with stand-in settings where a widget would otherwise be blank
 * until it is configured. Ids are thrown away; nothing built here reaches the document.
 */
function sample(kind: WidgetKind, t: (key: string) => string): Widget {
  const props: Partial<Record<WidgetKind, Props>> = {
    nav: { target: "home" },
    link: { label: t("gallery.sample.link"), href: "https://example.com/notes" },
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
 * The shelf of widgets a page can be built from.
 *
 * Every tile is the real widget, rendered through the same registry the page uses, and filled with
 * stand-in content so it demonstrates itself. There is no name over it and no sentence under it: a
 * caption reading "Activity" asks you to imagine a heatmap, and a tile showing a year of marks does
 * not. The content is invented rather than the viewer's own — a preview holding your real posts
 * reads as the page rather than as a sample of one.
 *
 * Two kinds behave differently in a tile, and only because rendering them honestly would be wrong
 * here rather than to save effort: an unconfigured widget shows sample settings, and Winamp shows a
 * still frame instead of starting an audio context in every tile.
 *
 * A grid, not a list. The core widgets are the whole shelf for now, but widgets people write and
 * share belong on the same one, and a shelf shaped like a settings page is the wrong thing to grow
 * into a catalogue.
 *
 * It collapses, and remembers. The shelf is useful when you are adding something and in the way for
 * the rest of the time, and what is being arranged is the page underneath it.
 */
export default function WidgetGallery({ onAdd }: WidgetGalleryProps) {
  const { t } = useTranslation();

  // Read once, when the state is first created, rather than in an effect that would render the shelf
  // open and then immediately closed. The read is guarded because storage throws outright in some
  // contexts — a private window, a browser set to block site data — rather than returning nothing.
  const [open, setOpen] = useState(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY) !== "false";
    } catch {
      return true;
    }
  });

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // It still collapses for this visit; it just will not be remembered.
    }
  };

  return (
    <section className="widget-gallery" aria-label={t("gallery.title")} data-open={open ? "" : undefined}>
      <button
        type="button"
        className="widget-gallery-toggle"
        aria-expanded={open}
        onClick={toggle}
      >
        <span className="widget-gallery-caret" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
        {t("gallery.title")}
      </button>

      {open && (
        // The stand-in profile wraps the whole shelf: the widgets that read a profile take it from
        // context, so the gallery supplies one rather than each tile inventing its own.
        <ProfileScopeProvider value={DEMO_SCOPE}>
          <ul className="widget-gallery-grid">
            {galleryKinds().map((kind) => {
              const View = WIDGET_REGISTRY[kind];
              const label = t(`widgets.${kind}.label`);

              return (
                <li className="widget-card" key={kind} data-widget={kind}>
                  {/* inert rather than pointer-events alone: a preview holds real links and real
                      buttons, and they should be out of reach of the keyboard too. */}
                  <div className="widget-card-preview" inert aria-hidden="true">
                    <View widget={sample(kind, t)} editing={false} preview onChange={() => {}} />
                  </div>

                  {/* The button covers the tile but is a sibling of the preview, never its parent. A
                      timeline preview contains the real timeline, tab buttons and all, and a button
                      inside a button is not something HTML can parse. */}
                  <button
                    type="button"
                    className="widget-card-button"
                    // The only place the widget's name still appears, for anyone who cannot see the
                    // tile that would otherwise have said it.
                    aria-label={`${t("gallery.add")}: ${label}`}
                    title={label}
                    onClick={() => onAdd(kind)}
                  >
                    <span className="widget-card-veil">{t("gallery.add")}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </ProfileScopeProvider>
      )}
    </section>
  );
}
