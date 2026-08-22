import { useRef, useState, type ReactNode } from "react";
import {
  SIZE_SPAN,
  WIDGETS,
  cycleSize,
  duplicateWidget,
  moveWidget,
  removeWidget,
} from "../../../Services/layout";
import type { Widget } from "../../../Services/profile";
import { useFlip } from "../../Hooks/useFlip";
import ConfirmDialog from "../ConfirmDialog/ConfirmDialog";

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
  en: {
    resize: "Resize",
    remove: "Remove",
    duplicate: "Duplicate",
    confirmTitle: "Remove this widget?",
    confirmMessage:
      "It comes off your profile straight away. You can add it again from the Widgets Gallery, but anything you typed into it is gone.",
    confirm: "remove",
    cancel: "cancel",
  },
  ja: {
    resize: "サイズ変更",
    remove: "削除",
    duplicate: "複製",
    confirmTitle: "このウィジェットを削除しますか？",
    confirmMessage:
      "すぐにプロフィールから外れます。ウィジェットギャラリーから追加し直せますが、入力した内容は失われます。",
    confirm: "削除",
    cancel: "キャンセル",
  },
} as const;

/**
 * The grid a profile is arranged on, and — when `editing` — the editor for it.
 *
 * There is deliberately no separate preview pane. What is being edited is the page itself, with
 * handles laid over the real widgets, because an editor showing an abstraction of the page makes you
 * imagine the result rather than see it.
 *
 * Dragging is pointer-only by nature, so everything a drag does is also on a button: resize,
 * duplicate, remove. A profile should not be arrangeable only with a mouse.
 */
export default function WidgetBoard({
  widgets,
  render,
  isJapanese,
  editing = false,
  onChange,
}: WidgetBoardProps) {
  const text = isJapanese ? TEXT.ja : TEXT.en;
  // The widget being carried, by id rather than index: the order changes underneath a drag, so an
  // index would stop referring to the thing in your hand after the first swap.
  const [dragging, setDragging] = useState<string | null>(null);
  const draggedNode = useRef<HTMLElement | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<Widget | null>(null);
  const flipRef = useFlip();

  const update = (next: Widget[]) => onChange?.(next);
  const remove = (widget: Widget) => update(removeWidget(widgets, widget.id));

  /**
   * Reorders as the pointer passes over a widget, rather than waiting for the drop.
   *
   * The board rearranging under your hand is what tells you where the widget will land; a drop that
   * only reveals the result afterwards makes you drop it to find out and undo it if you were wrong.
   *
   * The midpoint rule is what stops that turning into a flicker. Once two widgets swap, the one in
   * your hand is sitting where the other was — still under the pointer, so the next dragover would
   * swap them straight back, and the pair would trade places for as long as you held still. Taking
   * a slot only after the pointer is past the middle of it, in the direction you are travelling,
   * means swapping back requires actually moving back.
   */
  const reorderOver = (target: Widget, event: { clientX: number; clientY: number }) => {
    if (dragging === null || dragging === target.id) return;

    const from = widgets.findIndex((widget) => widget.id === dragging);
    const to = widgets.findIndex((widget) => widget.id === target.id);
    if (from === -1 || to === -1 || from === to) return;

    const carried = draggedNode.current?.getBoundingClientRect();
    const over = flipRef.rect(target.id);

    if (carried && over) {
      // Widgets side by side are approached across; stacked ones from above or below. Whichever
      // separation is larger is the axis the gesture is actually happening on.
      const horizontal = Math.abs(over.left - carried.left) > Math.abs(over.top - carried.top);
      const forward = from < to;

      if (horizontal) {
        const middle = over.left + over.width / 2;
        if (forward ? event.clientX < middle : event.clientX > middle) return;
      } else {
        const middle = over.top + over.height / 2;
        if (forward ? event.clientY < middle : event.clientY > middle) return;
      }
    }

    update(moveWidget(widgets, from, to));
  };

  return (
    <>
      {/* The dance stops for the duration of a drag. It is a transform, and every measurement this
          makes — where the pointer is relative to a widget's middle, where a widget has to slide
          from — reads the transformed box: a metre-wide widget tilted less than half a degree still
          has its corners several pixels off, which is enough to misread a midpoint and swap the
          wrong pair. It resumes the moment the widget lands. */}
      <div
        className={[
          "widget-board",
          editing ? "is-editing" : "",
          dragging !== null ? "is-reordering" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {widgets.map((widget) => {
          const content = render(widget);
          if (!editing && content === null) return null;

          const spec = WIDGETS[widget.kind];

          return (
            <section
              key={widget.id}
              ref={flipRef.node(widget.id)}
              className={`widget ${dragging === widget.id ? "is-dragging" : ""}`.trim()}
              style={{ gridColumn: `span ${SIZE_SPAN[widget.size]}` }}
              data-widget={widget.kind}
              draggable={editing}
              onDragStart={(e) => {
                draggedNode.current = e.currentTarget;
                setDragging(widget.id);
              }}
              onDragEnd={() => {
                draggedNode.current = null;
                setDragging(null);
              }}
              onDragOver={(e) => {
                if (!editing) return;
                e.preventDefault();
                reorderOver(widget, e);
              }}
              onDrop={(e) => {
                if (!editing) return;
                // The order is already what the drag showed, so dropping only ends the gesture.
                e.preventDefault();
                draggedNode.current = null;
                setDragging(null);
              }}
            >
              {/* The corner badge an iPhone puts on a jiggling icon: it acts on this one widget, so
                  it sits on the widget rather than in a toolbar. */}
              {editing && (
                <button
                  type="button"
                  className="widget-remove-badge"
                  aria-label={text.remove}
                  title={text.remove}
                  onClick={() => (spec.confirmRemove ? setPendingRemoval(widget) : remove(widget))}
                >
                  ✕
                </button>
              )}

              {editing && (
                <div className="widget-chrome">
                  <span className="widget-label">{isJapanese ? spec.label.ja : spec.label.en}</span>

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
                      title={text.duplicate}
                      onClick={() => update(duplicateWidget(widgets, widget.id))}
                    >
                      ⧉
                    </button>
                    <span className="widget-grip" aria-hidden="true">⠿</span>
                  </div>
                </div>
              )}

              <div className="widget-content">{content}</div>
            </section>
          );
        })}
      </div>

      {pendingRemoval !== null && (
        <ConfirmDialog
          title={text.confirmTitle}
          message={text.confirmMessage}
          confirmLabel={text.confirm}
          cancelLabel={text.cancel}
          onCancel={() => setPendingRemoval(null)}
          onConfirm={() => {
            remove(pendingRemoval);
            setPendingRemoval(null);
          }}
        />
      )}
    </>
  );
}
