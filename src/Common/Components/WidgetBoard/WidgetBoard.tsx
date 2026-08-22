import { memo, useCallback, useRef, useState, type ReactNode } from "react";
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
  wrapWidgets,
  FLOWS,
} from "../../../Services/layout";
import type { MenuItem, Widget, WidgetBoardProps } from "../../../Types";
import { styleOf, styleVariables } from "../../../Services/widgetStyle";
import { WIDGET_REGISTRY } from "../../../Widgets";
import { DRAG_TYPE } from "../../../Services/widgetDrag";
import { useFitRow } from "../../Hooks/useFitRow";
import { useFlip } from "../../Hooks/useFlip";
import ConfirmDialog from "../ConfirmDialog/ConfirmDialog";
import ContextMenu from "../ContextMenu/ContextMenu";
import WidgetInspector from "../Inspector/WidgetInspector";

/**
 * One widget's view, memoised.
 *
 * A board re-renders whenever anything about it changes — a selection, a drag, a corner being
 * pulled — and without this every widget under it re-rendered too, which for a timeline or a
 * heatmap is a real amount of work for a change that did not touch them. Reordering keeps each
 * widget's object identity, so a drag now moves elements without redrawing any of them.
 *
 * A container's children arrive as a freshly built element each render, so containers do re-render;
 * their own children are memoised in turn, which is where the cost actually is.
 */
const WidgetSlot = memo(function WidgetSlot({
  widget,
  editing,
  replace,
  children,
}: {
  widget: Widget;
  editing: boolean;
  /** Board-level and stable; the per-widget handler is built from it here. */
  replace: (id: string, next: Widget) => void;
  children?: ReactNode;
}) {
  const View = WIDGET_REGISTRY[widget.kind];
  const onChange = useCallback((next: Widget) => replace(widget.id, next), [replace, widget.id]);

  return (
    <View widget={widget} editing={editing} onChange={onChange}>
      {children}
    </View>
  );
});

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
  anchor,
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

  /** Opening the Inspector also fixes what it hangs from, which is a thing to do from an event. */
  const inspect = (id: string | null) => {
    inspectorAnchor.current = id ? flipRef.element(id) : null;
    setInspecting(id);
  };
  // The widget whose corner is being pulled. While this is set the board shows its grid, so there is
  // something to aim at rather than a size that changes for no visible reason.
  const [resizing, setResizing] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const flipRef = useFlip();

  const free = flow === "free";

  /**
   * The widgets picked out, at this level only.
   *
   * Selection does not cross boards: what it is for is acting on a group of siblings at once —
   * wrapping them into a container above all — and a set spanning two levels has no single list to
   * take them out of.
   */
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);

  /**
   * The band's corners, in a ref rather than in state.
   *
   * A pointermove fires dozens of times a second, and putting the rectangle in state meant a render
   * of the whole board — every timeline, every heatmap, the player — for each one. The band is drawn
   * by writing to its own element's style directly, so dragging it costs one DOM write per move and
   * no React work at all. The selection it produces is state, once, on release.
   */
  const lasso = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const band = useRef<HTMLDivElement | null>(null);

  const drawBand = () => {
    const box = lasso.current;
    const node = band.current;
    if (!node) return;

    if (!box) {
      node.style.display = "none";
      return;
    }

    node.style.display = "block";
    node.style.left = `${Math.min(box.x1, box.x2)}px`;
    node.style.top = `${Math.min(box.y1, box.y2)}px`;
    node.style.width = `${Math.abs(box.x2 - box.x1)}px`;
    node.style.height = `${Math.abs(box.y2 - box.y1)}px`;
  };
  // A row neither wraps nor clips, so one with more in it than the page is wide has to give way
  // somewhere. Scrolling is a setting and wrapping is a different flow; left alone, it shrinks.
  const fit = useFitRow(flow === "row" && scroll === "none");

  const update = (next: Widget[]) => onChange?.(next);
  const replace = (id: string, next: Widget) =>
    update(widgets.map((item) => (item.id === id ? next : item)));

  /**
   * A change handler per widget, created once and kept.
   *
   * The obvious `onChange={(next) => replace(widget.id, next)}` is a new function on every render,
   * which defeats memoising the widget entirely — the prop differs each time even when nothing
   * else does. These close over a ref instead, so their identity is stable while what they act on
   * stays current.
   */
  /**
   * The stable version of "replace this widget".
   *
   * Written as an updater so it closes over nothing that changes — which is the whole point. The
   * obvious `onChange={(next) => replace(widget.id, next)}` is a new function on every render, and a
   * prop that differs every time defeats memoising the widget entirely.
   */
  const replaceById = useCallback(
    (id: string, next: Widget) =>
      onChange?.((prev) => prev.map((item) => (item.id === id ? next : item))),
    [onChange],
  );

  /**
   * The same, for a container's contents.
   *
   * A nested board hands up either a list or an updater, and the updater has to be applied against
   * that container's children as they are at the moment of the write rather than as they were when
   * this closure was made — which is the point of threading updaters all the way down.
   */
  const replaceChildren = useCallback(
    (id: string, children: Widget[] | ((prev: Widget[]) => Widget[])) =>
      onChange?.((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                children:
                  typeof children === "function" ? children(item.children ?? []) : children,
              }
            : item,
        ),
      ),
    [onChange],
  );

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

  /**
   * A rubber band over the board's own background.
   *
   * Started only where the press lands on the board itself rather than on a widget, so it cannot
   * begin under something you meant to drag. What it selects is decided on release, from the rects
   * as they are then: selecting continuously while the band is drawn would flicker the outlines of
   * everything the pointer skimmed past.
   */
  const startLasso = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!editing || event.button !== 0) return;
    if (event.target !== event.currentTarget) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    lasso.current = { x1: event.clientX, y1: event.clientY, x2: event.clientX, y2: event.clientY };
    drawBand();
    // Only if something was selected: an unconditional set would re-render the board on every click
    // on the background.
    setSelected((current) => (current.size === 0 ? current : new Set()));
  };

  const endLasso = () => {
    const drawn = lasso.current;
    lasso.current = null;
    drawBand();
    if (!drawn) return;

    const box = {
      left: Math.min(drawn.x1, drawn.x2),
      right: Math.max(drawn.x1, drawn.x2),
      top: Math.min(drawn.y1, drawn.y2),
      bottom: Math.max(drawn.y1, drawn.y2),
    };

    // A click rather than a drag: nothing was being selected, so this only clears.
    if (box.right - box.left < 4 && box.bottom - box.top < 4) return;

    const caught = new Set<string>();
    for (const item of widgets) {
      const rect = flipRef.rect(item.id);
      if (!rect) continue;
      // Touched, not enclosed: having to draw a band right around a full-width widget to catch it
      // would make the gesture useless on the very boards it is most wanted on.
      const misses =
        rect.right < box.left || rect.left > box.right || rect.bottom < box.top || rect.top > box.bottom;
      if (!misses) caught.add(item.id);
    }

    setSelected(caught);
  };

  /** What the right-click menu offers for a widget, and for a selection it happens to be part of. */
  const menuItems = (item: Widget): MenuItem[] => {
    const group = selected.has(item.id) && selected.size > 1 ? selected : new Set([item.id]);
    const spec = WIDGETS[item.kind];

    return [
      {
        label: t("menu.inspect"),
        onSelect: () => inspect(item.id),
      },
      {
        label: t("menu.duplicate"),
        onSelect: () => update(duplicateWidget(widgets, item.id)),
      },
      {
        // The submenu is which kind of container: they differ only by the flow they lay out with,
        // and choosing it here saves opening the Inspector to change it straight afterwards.
        label: group.size > 1 ? t("menu.wrapMany", { count: group.size }) : t("menu.wrap"),
        items: FLOWS.map((into) => ({
          label: t(`flows.${into}`),
          onSelect: () => {
            update(wrapWidgets(widgets, group as Set<string>, into));
            setSelected(new Set());
          },
        })),
      },
      {
        label: t("board.remove"),
        danger: true,
        onSelect: () => {
          if (group.size === 1 && spec.confirmRemove) {
            setPendingRemoval(item);
            return;
          }
          update(widgets.filter((w) => !group.has(w.id)));
          setSelected(new Set());
        },
      },
    ];
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
        onPointerDown={startLasso}
        onPointerMove={(e) => {
          if (!lasso.current) return;
          lasso.current = { ...lasso.current, x2: e.clientX, y2: e.clientY };
          drawBand();
        }}
        onPointerUp={endLasso}
        onPointerCancel={() => {
          lasso.current = null;
          drawBand();
        }}
      >
        {widgets.map((widget) => {
          const spec = WIDGETS[widget.kind];
          const container = isContainer(widget);
          const style = styleOf(widget);

          const content = (
            <WidgetSlot widget={widget} editing={editing} replace={replaceById}>
              {container && (
                <WidgetBoard
                  widgets={widget.children ?? []}
                  flow={flowOf(widget)}
                  scroll={scrollOf(widget)}
                  editing={editing}
                  onChange={(children) => replaceChildren(widget.id, children)}
                />
              )}
            </WidgetSlot>
          );

          return (
            <section
              key={widget.id}
              ref={flipRef.node(widget.id)}
              className={[
                "widget",
                dragging === widget.id ? "is-dragging" : "",
                selected.has(widget.id) ? "is-selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
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
              onContextMenu={(e) => {
                if (!editing) return;
                e.preventDefault();
                e.stopPropagation();
                // Right-clicking outside the selection acts on what was clicked, not on what
                // happened to be selected a moment ago.
                if (!selected.has(widget.id)) setSelected(new Set([widget.id]));
                setMenu({ x: e.clientX, y: e.clientY, id: widget.id });
              }}
              onDragStart={(e) => {
                draggedNode.current = e.currentTarget;
                setDragging(widget.id);
                // So another anchor can identify what landed on it.
                e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ id: widget.id, anchor }));
                e.dataTransfer.effectAllowed = "move";
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
                      onClick={() => inspect(inspecting === widget.id ? null : widget.id)}
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

      {/* Always in the document while arranging, hidden until drawn. Mounting it on pointerdown
          would put a render between the press and the first sight of it. */}
      {editing && (
        <div className="widget-lasso" aria-hidden="true" ref={band} style={{ display: "none" }} />
      )}

      {menu !== null && (() => {
        const target = widgets.find((item) => item.id === menu.id);
        if (!target) return null;

        return (
          <ContextMenu
            x={menu.x}
            y={menu.y}
            items={menuItems(target)}
            onClose={() => setMenu(null)}
          />
        );
      })()}

      {editing && inspecting !== null && (() => {
        const target = widgets.find((item) => item.id === inspecting);
        if (!target) return null;

        return (
          <WidgetInspector
            widget={target}
            anchor={inspectorAnchor}
            onChange={(next: Widget) => replace(target.id, next)}
            onClose={() => inspect(null)}
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
