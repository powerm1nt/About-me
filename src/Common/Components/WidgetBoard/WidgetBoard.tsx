import { useState, type ReactNode } from "react";
import { SIZE_SPAN, WIDGETS, cycleSize, moveWidget } from "../../../Services/layout";
import type { Widget } from "../../../Services/profile";

export interface WidgetBoardProps {
  widgets: Widget[];
  /** What each widget shows. One with nothing to show is skipped rather than left empty. */
  render: (widget: Widget) => ReactNode;
  isJapanese: boolean;
  /** Editing turns the board into its own editor: the real page, with handles on it. */
  editing?: boolean;
  onChange?: (widgets: Widget[]) => void;
}

const TEXT = {
  en: { resize: "Resize", remove: "Remove", hide: "Hide", show: "Show", hidden: "Hidden" },
  ja: { resize: "サイズ変更", remove: "削除", hide: "非表示", show: "表示", hidden: "非表示中" },
} as const;

/**
 * The grid a profile is arranged on, and — when `editing` — the editor for it.
 *
 * There is deliberately no separate preview pane. What is being edited is the page itself, with
 * handles laid over the real widgets, because an editor showing an abstraction of the page makes you
 * imagine the result rather than see it.
 *
 * Dragging is pointer-only by nature, so everything a drag does is also on a button: move, resize,
 * hide, remove. A profile should not be arrangeable only with a mouse.
 */
export default function WidgetBoard({
  widgets,
  render,
  isJapanese,
  editing = false,
  onChange,
}: WidgetBoardProps) {
  const text = isJapanese ? TEXT.ja : TEXT.en;
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const shown = editing ? widgets : widgets.filter((widget) => !widget.hidden);
  const update = (next: Widget[]) => onChange?.(next);

  return (
    <div className={`widget-board ${editing ? "is-editing" : ""}`.trim()}>
      {shown.map((widget) => {
        const index = widgets.indexOf(widget);
        const content = render(widget);
        if (!editing && content === null) return null;

        const spec = WIDGETS[widget.kind];

        return (
          <section
            key={widget.id}
            className={`widget ${widget.hidden ? "is-hidden" : ""} ${dragging === index ? "is-dragging" : ""} ${over === index ? "is-over" : ""}`.trim()}
            style={{ gridColumn: `span ${SIZE_SPAN[widget.size]}` }}
            data-widget={widget.kind}
            draggable={editing}
            onDragStart={() => setDragging(index)}
            onDragEnd={() => {
              setDragging(null);
              setOver(null);
            }}
            onDragOver={(e) => {
              if (!editing) return;
              e.preventDefault();
              setOver(index);
            }}
            onDrop={(e) => {
              if (!editing) return;
              e.preventDefault();
              if (dragging !== null) update(moveWidget(widgets, dragging, index));
              setDragging(null);
              setOver(null);
            }}
          >
            {editing && (
              <div className="widget-chrome">
                <span className="widget-label">
                  {isJapanese ? spec.label.ja : spec.label.en}
                  {widget.hidden && <em> — {text.hidden}</em>}
                </span>

                <div className="widget-controls">
                  <button
                    type="button"
                    className="widget-btn"
                    title={text.resize}
                    disabled={spec.sizes.length < 2}
                    onClick={() =>
                      update(widgets.map((w) => (w.id === widget.id ? { ...w, size: cycleSize(w) } : w)))
                    }
                  >
                    ⤢ {widget.size}
                  </button>
                  <button
                    type="button"
                    className="widget-btn"
                    title={widget.hidden ? text.show : text.hide}
                    onClick={() =>
                      update(widgets.map((w) => (w.id === widget.id ? { ...w, hidden: !w.hidden } : w)))
                    }
                  >
                    {widget.hidden ? "◻" : "◼"}
                  </button>
                  {/* Only a widget that can be added back may be removed; the rest hide instead, so
                      a board cannot end up missing its timeline with no way to restore it. */}
                  {spec.repeatable && (
                    <button
                      type="button"
                      className="widget-btn widget-btn-remove"
                      title={text.remove}
                      onClick={() => update(widgets.filter((w) => w.id !== widget.id))}
                    >
                      ×
                    </button>
                  )}
                  <span className="widget-grip" aria-hidden="true">⠿</span>
                </div>
              </div>
            )}

            <div className="widget-content">{content}</div>
          </section>
        );
      })}
    </div>
  );
}
