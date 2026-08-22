import { useTranslation } from "react-i18next";
import { WIDGETS, galleryKinds, newId } from "../../../Services/layout";
import type { Widget, WidgetKind } from "../../../Services/profile";
import { WIDGET_REGISTRY } from "../../../Widgets";

export interface WidgetGalleryProps {
  onAdd: (kind: WidgetKind) => void;
}

/** Enough of a widget to render one. Ids are thrown away; nothing here reaches the document. */
const sample = (kind: WidgetKind): Widget => ({
  id: `gallery-${newId()}`,
  kind,
  size: WIDGETS[kind].defaultSize,
  props: kind === "text" ? {} : {},
  children: WIDGETS[kind].container ? [] : undefined,
});

/**
 * The shelf of widgets a page can be built from.
 *
 * Every tile renders the real widget through the same registry the page uses — no name over it and
 * no sentence under it. That is the point of showing the thing rather than describing it: a caption
 * reading "Activity" asks you to imagine a heatmap, while a tile showing your own heatmap has
 * already answered the question.
 *
 * A widget that has nothing to show falls back to its one-line description. That happens honestly:
 * the profile widgets read their content from a scope the gallery is often outside of, so a heatmap
 * previewed from the header genuinely has no data, and saying so is better than inventing some.
 *
 * A grid, not a list. The core widgets are the whole shelf for now, but widgets people write and
 * share with each other belong on the same one, and a shelf shaped like a settings page is the wrong
 * thing to grow into a catalogue.
 *
 * Nothing here is ever unavailable: a page may hold as many timelines, containers or text panels as
 * its owner wants, and a shelf that greys out what you already have decides that for you.
 */
export default function WidgetGallery({ onAdd }: WidgetGalleryProps) {
  const { t } = useTranslation();

  return (
    <section className="widget-gallery" aria-label={t("gallery.title")}>
      <ul className="widget-gallery-grid">
        {galleryKinds().map((kind) => {
          const View = WIDGET_REGISTRY[kind];
          const label = t(`widgets.${kind}.label`);

          return (
            <li className="widget-card" key={kind} data-widget={kind}>
              {/* inert rather than pointer-events alone: a preview holds real links and real
                  buttons, and they should be out of reach of the keyboard too. */}
              <div className="widget-card-preview" inert aria-hidden="true">
                <View widget={sample(kind)} editing={false} onChange={() => {}} />
                <p className="widget-card-empty">{t(`widgets.${kind}.description`)}</p>
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
    </section>
  );
}
