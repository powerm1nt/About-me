import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FREE_ROW_HEIGHT,
  GRID_COLUMNS,
  SIZE_SPAN,
  WIDGETS,
  cycleFlow,
  cycleSize,
  duplicateWidget,
  flowOf,
  isContainer,
  moveWidget,
  placementOf,
  removeWidget,
  scrollOf,
  sizeForSpan,
  withPlacement,
  type Flow,
  type Scroll,
} from "../../../Services/layout";
import type { Widget } from "../../../Services/profile";
import { styleOf, styleVariables } from "../../../Services/widgetStyle";
import { WIDGET_REGISTRY } from "../../../Widgets";
import { useFitRow } from "../../Hooks/useFitRow";
import { useFlip } from "../../Hooks/useFlip";
import ConfirmDialog from "../ConfirmDialog/ConfirmDialog";
import Inspector from "../Inspector/Inspector";

export interface WidgetBoardProps {
  widgets: Widget[];
  /** How this level lays its widgets out. A container passes its own flow to its children. */
  flow?: Flow;
  /** Whether this level scrolls. Off unless a container was set to. */
  scroll?: Scroll;
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
  scroll = "none",
  editing = false,
  onChange,
}: WidgetBoardProps) {
  const { t } = useTranslation();
  // The widget being carried, by id rather than index: the order changes underneath a drag, so an
  // index would stop referring to the thing in your hand after the first swap.
  const [dragging, setDragging] = useState<string | null>(null);
  const draggedNode = useRef<HTMLElement | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<Widget | null>(null);
  // Which widget's Inspector is open, and the element it hangs from. One at a time: two panels for
  // two widgets would leave no way to tell which one you were changing.
  const [inspecting, setInspecting] = useState<string | null>(null);
  const inspectorAnchor = useRef<HTMLElement | null>(null);
  // The widget whose corner is being pulled. While this is set the board shows its grid, so there is
  // something to aim at rather than a size that changes for no visible reason.
  const [resizing, setResizing] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const flipRef = useFlip();

  const free = flow === "free";
  // A row neither wraps nor clips, so one with more in it than the page is wide has to give way
  // somewhere. Scrolling is a setting and wrapping is a different flow; left alone, it shrinks.
  const fit = useFitRow(flow === "row" && scroll === "none");

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

  /** The size of one grid cell, measured rather than assumed: the columns reflow with the board. */
  const cellSize = () => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { rect, width: rect.width / GRID_COLUMNS, height: FREE_ROW_HEIGHT };
  };

  /**
   * Pulling the bottom-right corner.
   *
   * On a free board this sets the widget's span in cells directly. On an ordinary grid there are
   * only three widths to land on, so the column count is rounded to the nearest one the widget
   * allows — a widget that only comes full width snaps back rather than sticking wherever the
   * pointer stopped.
   */
  const resizeTo = (item: Widget, event: { clientX: number; clientY: number }) => {
    const cell = cellSize();
    const box = flipRef.rect(item.id);
    if (!cell || !box) return;

    const columns = Math.max(1, Math.round((event.clientX - box.left) / cell.width));

    if (!free) {
      const next = sizeForSpan(item.kind, Math.min(GRID_COLUMNS, columns));
      if (next !== item.size) replace(item.id, { ...item, size: next });
      return;
    }

    const place = placementOf(item);
    const w = Math.min(GRID_COLUMNS - place.col + 1, columns);
    const h = Math.max(1, Math.round((event.clientY - box.top) / cell.height));
    if (w !== place.w || h !== place.h) replace(item.id, withPlacement(item, { ...place, w, h }));
  };

  /** Dragging on a free board puts the widget in a cell rather than reordering the list. */
  const placeOver = (item: Widget, event: { clientX: number; clientY: number }) => {
    const cell = cellSize();
    if (!cell) return;

    const place = placementOf(item);
    const col = Math.min(
      GRID_COLUMNS - place.w + 1,
      Math.max(1, Math.floor((event.clientX - cell.rect.left) / cell.width) + 1),
    );
    const row = Math.max(1, Math.floor((event.clientY - cell.rect.top) / cell.height) + 1);

    if (col !== place.col || row !== place.row) {
      replace(item.id, withPlacement(item, { ...place, col, row }));
    }
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
          dragging !== null || resizing !== null ? "is-reordering" : "",
          resizing !== null ? "is-snapping" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        ref={(node) => {
          boardRef.current = node;
          fit.ref(node);
        }}
        data-flow={flow}
        data-scroll={scroll}
        // The cell height a free board snaps to, so the CSS and the arithmetic cannot disagree.
        style={free ? ({ "--free-row": `${FREE_ROW_HEIGHT}px` } as React.CSSProperties) : undefined}
      >
        {widgets.map((widget) => {
          const spec = WIDGETS[widget.kind];
          const View = WIDGET_REGISTRY[widget.kind];
          const container = isContainer(widget);
          const style = styleOf(widget);

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
                  scroll={scrollOf(widget)}
                  editing={editing}
                  onChange={(children) => replace(widget.id, { ...widget, children })}
                />
              )}
            </View>
          );

          return (
            <section
              key={widget.id}
              ref={(node) => {
                flipRef.node(widget.id)(node);
                if (inspecting === widget.id) inspectorAnchor.current = node;
              }}
              className={`widget ${dragging === widget.id ? "is-dragging" : ""}`.trim()}
              style={{
                // A free board places by cell; an ordinary grid by span. A row or a column is laid
                // out by what is in it, and a grid-column on a flex item is simply ignored.
                ...(free
                  ? (() => {
                      const p = placementOf(widget);
                      return {
                        gridColumn: `${p.col} / span ${p.w}`,
                        gridRow: `${p.row} / span ${p.h}`,
                      };
                    })()
                  : flow === "grid"
                    ? { gridColumn: `span ${SIZE_SPAN[widget.size]}` }
                    : {}),
                ...styleVariables(style),
              }}
              data-widget={widget.kind}
              // What the server scopes this widget's own stylesheet to. Must match widgetScope() in
              // server/services/layoutCss.ts, or a widget's CSS lands on nothing.
              data-widget-id={widget.id}
              data-border={style.border}
              data-shadow={style.shadow}
              data-inspecting={inspecting === widget.id ? "" : undefined}
              // Takes the slack at the end of a bar — how the account tile sits at the far right
              // without being pinned there.
              data-push={widget.props?.push ? "" : undefined}
              draggable={editing && resizing === null}
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
                if (free) placeOver(widget, e);
                else reorderOver(widget, e);
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
                    <button
                      type="button"
                      className="widget-btn"
                      title={t("inspector.open")}
                      aria-expanded={inspecting === widget.id}
                      onClick={() => setInspecting(inspecting === widget.id ? null : widget.id)}
                    >
                      ⚙
                    </button>
                    <span className="widget-grip" aria-hidden="true">⠿</span>
                  </div>
                </div>
              )}

              {/* The corner you pull to resize. Pointer events rather than the drag machinery: a
                  drag would move the widget, and this has to change its size while it stays put.
                  Only where a size means something — a row or a column is measured by its contents. */}
              {editing && (flow === "grid" || free) && (
                <span
                  className="widget-resize-handle"
                  role="slider"
                  tabIndex={0}
                  aria-label={t("board.resize")}
                  aria-valuenow={free ? placementOf(widget).w : SIZE_SPAN[widget.size]}
                  aria-valuemin={1}
                  aria-valuemax={GRID_COLUMNS}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setResizing(widget.id);
                  }}
                  onPointerMove={(e) => {
                    if (resizing !== widget.id) return;
                    resizeTo(widget, e);
                  }}
                  onPointerUp={(e) => {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                    setResizing(null);
                  }}
                  onPointerCancel={() => setResizing(null)}
                  // The same thing from the keyboard, since a corner is pointer-only by nature.
                  onKeyDown={(e) => {
                    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
                    if (step === 0) return;
                    e.preventDefault();

                    if (free) {
                      const p = placementOf(widget);
                      const w = Math.min(GRID_COLUMNS - p.col + 1, Math.max(1, p.w + step));
                      replace(widget.id, withPlacement(widget, { ...p, w }));
                    } else {
                      const next = sizeForSpan(widget.kind, SIZE_SPAN[widget.size] + step);
                      if (next !== widget.size) replace(widget.id, { ...widget, size: next });
                    }
                  }}
                />
              )}

              {/* Only ever the server's scoped version: the raw source could restyle the whole app,
                  or somebody else's profile on a shared page. */}
              {style.scopedCss && <style>{style.scopedCss}</style>}

              <div className="widget-content">{content}</div>
            </section>
          );
        })}
      </div>

      {editing && inspecting !== null && (() => {
        const target = widgets.find((item) => item.id === inspecting);
        if (!target) return null;

        return (
          <Inspector
            widget={target}
            anchor={inspectorAnchor}
            onChange={(next) => replace(target.id, next)}
            onClose={() => setInspecting(null)}
          />
        );
      })()}

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
