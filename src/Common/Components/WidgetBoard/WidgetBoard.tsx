import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  SIZE_SPAN,
  WIDGETS,
  cycleFlow,
  cycleSize,
  duplicateWidget,
  flowOf,
  isContainer,
  moveWidget,
  removeWidget,
  type Flow,
} from "../../../Services/layout";
import type { Widget } from "../../../Services/profile";
import { WIDGET_REGISTRY } from "../../../Widgets";
import { useFlip } from "../../Hooks/useFlip";
import ConfirmDialog from "../ConfirmDialog/ConfirmDialog";

export interface WidgetBoardProps {
  widgets: Widget[];
  /** How this level lays its widgets out. A container passes its own flow to its children. */
  flow?: Flow;
  /** Editing turns the board into its own editor: the real page, with handles on it. */
  editing?: boolean;
  onChange?: (widgets: Widget[]) => void;
}

/**
 * The board a page is arranged on, and — when `editing` — the editor for it.
 *
 * There is deliberately no separate preview pane. What is being edited is the page itself, with
 * handles laid over the real widgets, because an editor showing an abstraction of the page makes you
 * imagine the result rather than see it.
 *
 * Containers hold boards of their own, which is how one component renders the header bar, the
 * footer, a sidebar and the profile body: they differ only in which anchor they sit at and which
 * flow they were set to.
 *
 * Dragging is pointer-only by nature, so everything a drag does is also on a button: resize,
 * duplicate, remove, and a container's layout. A page should not be arrangeable only with a mouse.
 */
export default function WidgetBoard({
  widgets,
  flow = "grid",
  editing = false,
  onChange,
}: WidgetBoardProps) {
  const { t } = useTranslation();
  // The widget being carried, by id rather than index: the order changes underneath a drag, so an
  // index would stop referring to the thing in your hand after the first swap.
  const [dragging, setDragging] = useState<string | null>(null);
  const draggedNode = useRef<HTMLElement | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<Widget | null>(null);
  const flipRef = useFlip();

  const update = (next: Widget[]) => onChange?.(next);
  const replace = (id: string, next: Widget) =>
    update(widgets.map((item) => (item.id === id ? next : item)));

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

    const from = widgets.findIndex((item) => item.id === dragging);
    const to = widgets.findIndex((item) => item.id === target.id);
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
      {/* The dance stops for the duration of a drag. It is a transform, and every measurement made
          here — where the pointer is relative to a widget's middle, where a widget has to slide from
          — reads the transformed box: a full-width widget tilted less than half a degree still has
          its corners several pixels off, which is enough to misread a midpoint and swap the wrong
          pair. It resumes the moment the widget lands. */}
      <div
        className={[
          "widget-board",
          editing ? "is-editing" : "",
          dragging !== null ? "is-reordering" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        data-flow={flow}
      >
        {widgets.map((widget) => {
          const spec = WIDGETS[widget.kind];
          const View = WIDGET_REGISTRY[widget.kind];
          const container = isContainer(widget);

          const content = (
            <View
              widget={widget}
              editing={editing}
              onChange={(next) => replace(widget.id, next)}
            >
              {container && (
                <WidgetBoard
                  widgets={widget.children ?? []}
                  flow={flowOf(widget)}
                  editing={editing}
                  onChange={(children) => replace(widget.id, { ...widget, children })}
                />
              )}
            </View>
          );

          return (
            <section
              key={widget.id}
              ref={flipRef.node(widget.id)}
              className={`widget ${dragging === widget.id ? "is-dragging" : ""}`.trim()}
              // Only a grid places by span. A row or a column is laid out by what is in it, and a
              // grid-column on a flex item is simply ignored.
              style={flow === "grid" ? { gridColumn: `span ${SIZE_SPAN[widget.size]}` } : undefined}
              data-widget={widget.kind}
              // Takes the slack at the end of a bar — how the account tile sits at the far right
              // without being pinned there.
              data-push={widget.props?.push ? "" : undefined}
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
                // A container's own board handles drops inside it; this level must not also claim
                // them, or dragging into a container would reorder the container instead.
                e.stopPropagation();
                reorderOver(widget, e);
              }}
              onDrop={(e) => {
                if (!editing) return;
                // The order is already what the drag showed, so dropping only ends the gesture.
                e.preventDefault();
                e.stopPropagation();
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
                  aria-label={t("board.remove")}
                  title={t("board.remove")}
                  onClick={() =>
                    spec.confirmRemove
                      ? setPendingRemoval(widget)
                      : update(removeWidget(widgets, widget.id))
                  }
                >
                  ✕
                </button>
              )}

              {editing && (
                <div className="widget-chrome">
                  <span className="widget-label">{t(`widgets.${widget.kind}.label`)}</span>

                  <div className="widget-controls">
                    {/* A container's one real setting: which way its children run. */}
                    {container && (
                      <button
                        type="button"
                        className="widget-btn"
                        title={t("board.layout")}
                        onClick={() =>
                          replace(widget.id, {
                            ...widget,
                            props: { ...widget.props, flow: cycleFlow(widget) },
                          })
                        }
                      >
                        {t(`flows.${flowOf(widget)}`)}
                      </button>
                    )}
                    <button
                      type="button"
                      className="widget-btn"
                      title={t("board.resize")}
                      disabled={spec.sizes.length < 2}
                      onClick={() => replace(widget.id, { ...widget, size: cycleSize(widget) })}
                    >
                      {widget.size}
                    </button>
                    <button
                      type="button"
                      className="widget-btn"
                      title={t("board.duplicate")}
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
          title={t("board.confirmTitle")}
          message={t("board.confirmMessage")}
          confirmLabel={t("board.confirm")}
          cancelLabel={t("board.cancel")}
          onCancel={() => setPendingRemoval(null)}
          onConfirm={() => {
            update(removeWidget(widgets, pendingRemoval.id));
            setPendingRemoval(null);
          }}
        />
      )}
    </>
  );
}
