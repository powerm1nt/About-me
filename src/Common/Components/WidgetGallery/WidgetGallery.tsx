import type { ReactNode } from "react";
import { WIDGETS } from "../../../Services/layout";
import type { WidgetKind } from "../../../Services/profile";

export interface WidgetGalleryProps {
  isJapanese: boolean;
  onAdd: (kind: WidgetKind) => void;
  /**
   * The widget itself, rendered for real. Not an illustration of one: the gallery shows the same
   * component the board shows, with the same content, so what you pick is what you get.
   */
  renderPreview: (kind: WidgetKind) => ReactNode;
}

const TEXT = {
  en: { title: "Widgets Gallery", add: "Add to profile" },
  ja: { title: "ウィジェットギャラリー", add: "プロフィールに追加" },
} as const;

/**
 * The shelf of widgets a profile can be built from, above the profile it builds.
 *
 * Every tile is the real widget, live, with this profile's own content in it — no name over it and
 * no sentence under it. That is the point of showing the thing rather than describing it: a caption
 * reading "Activity" asks you to imagine a heatmap, while a tile showing your own heatmap has
 * already answered the question, and a widget that turns out to be empty says so about itself far
 * better than any wording could.
 *
 * A grid, not a list. The core widgets are the whole shelf for now, but widgets people write and
 * share with each other belong on the same one, and a shelf shaped like a settings page is the wrong
 * thing to grow into a catalogue.
 *
 * The previews are inert: they are there to be recognised, not operated. The whole tile is the
 * control, so picking one is a single click anywhere on the thing you are looking at.
 *
 * It stands in for both of the buttons it replaces. "Add text" was one entry in a shelf this makes
 * complete, and "Reset" was the only way back from a deletion — adding a widget again is now the
 * whole of what a reset used to do. Nothing here is ever unavailable, either: a profile may hold as
 * many timelines or text panels as its owner wants, and a shelf that greys out what you already have
 * decides that for you.
 */
export default function WidgetGallery({ isJapanese, onAdd, renderPreview }: WidgetGalleryProps) {
  const text = isJapanese ? TEXT.ja : TEXT.en;
  const kinds = Object.keys(WIDGETS) as WidgetKind[];

  return (
    <section className="widget-gallery" aria-label={text.title}>
      <ul className="widget-gallery-grid">
        {kinds.map((kind) => {
          const spec = WIDGETS[kind];
          const preview = renderPreview(kind);
          const label = isJapanese ? spec.label.ja : spec.label.en;

          return (
            <li className="widget-card" key={kind} data-widget={kind}>
              <button
                type="button"
                className="widget-card-button"
                // The tile shows the widget; the button has to say what it is for someone who cannot
                // see it, which is also the only place the widget's name still appears.
                aria-label={`${text.add}: ${label}`}
                title={label}
                onClick={() => onAdd(kind)}
              >
                {/* inert rather than pointer-events alone: a preview holds real links and real
                    buttons, and they should be out of reach of the keyboard too. */}
                <span className="widget-card-preview" inert aria-hidden="true">
                  {preview}
                </span>
                <span className="widget-card-veil" aria-hidden="true">
                  {text.add}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
