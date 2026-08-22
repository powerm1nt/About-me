import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { addWidget } from "../../../Services/layout";
import { usePageLayout } from "../../../Services/pageLayout";
import { readWidgetDrag } from "../../../Services/widgetDrag";
import type { AnchorRegionProps, Flow, Scroll } from "../../../Types";
import BoardInspector from "../Inspector/BoardInspector";
import WidgetBoard from "../WidgetBoard/WidgetBoard";

/** One of the page's five positions, and whatever has been put there. */
export default function AnchorRegion({ anchor, className, rail }: AnchorRegionProps) {
  const { t } = useTranslation();
  const {
    anchors,
    setAnchor,
    boards,
    setBoard,
    editing,
    moveWidget,
    dragging,
    insertPreviewWidget,
    finalizePreview,
  } = usePageLayout();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [over, setOver] = useState(false);
  const gear = useRef<HTMLButtonElement>(null);

  const widgets = anchors[anchor] ?? [];
  const board = boards[anchor];
  const enabled = board.enabled !== false;

  // Somewhere the dragged thing could go: a new widget can land anywhere, a moved one anywhere but
  // the board it came from.
  const isTarget = Boolean(dragging && (dragging.kind || dragging.anchor !== anchor));

  // Hidden on a finished page, but never while arranging: the gear is the only way back on, so
  // removing it with the rest would make disabling an anchor a one-way door.
  if (!enabled && !editing) return null;
  if (widgets.length === 0 && !editing) return null;

  // Painted only when there is something to paint behind.
  const background = widgets.length > 0 ? (board.background ?? "none") : "none";
  const intensity = board.intensity ?? 0.55;

  if (!enabled) {
    return (
      <div
        className={[
          "anchor-region",
          "is-disabled",
          isTarget ? "is-target" : "",
          over ? "is-drop-target" : "",
          className ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
        data-anchor={anchor}
        onDragOver={(e) => {
          if (!editing || !isTarget) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = dragging?.kind ? "copy" : "move";
          setOver(true);

          // Deliberately not enabling the anchor here: hovering is not a decision, and doing it on
          // dragover both turned the anchor on without a drop and marked the layout dirty on every
          // event. The drop below is what enables it.
          if (dragging?.kind && dragging.id) {
            insertPreviewWidget(dragging.id, dragging.kind, anchor);
          }
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setOver(false);
        }}
        onDrop={(e) => {
          setOver(false);
          if (!editing) return;

          const payload = readWidgetDrag(e.dataTransfer);
          if (!payload) return;
          e.preventDefault();

          setBoard(anchor, { enabled: true });

          if (payload.kind && payload.id) {
            finalizePreview();
            return;
          }

          if (payload.kind) {
            setAnchor(anchor, (prev) => addWidget(prev, payload.kind!));
            return;
          }

          const source = payload.anchor ?? dragging?.anchor;
          if (payload.id && source && source !== anchor) {
            moveWidget(payload.id, source, anchor);
          }
        }}
      >
        <button
          type="button"
          ref={gear}
          className="anchor-settings"
          aria-label={`${t("board.settings")} · ${t(`anchors.${anchor}`)}`}
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen(!settingsOpen)}
        >
          ⚙
        </button>
        <p className="anchor-disabled-label">
          {t("anchors." + anchor)} · {t("boardInspector.disabled")}
        </p>

        {isTarget && <span className="anchor-guide">{t(`anchors.${anchor}`)}</span>}

        {settingsOpen && (
          <BoardInspector anchor={anchor} trigger={gear} onClose={() => setSettingsOpen(false)} />
        )}
      </div>
    );
  }

  return (
    <div
      className={[
        "anchor-region",
        isTarget ? "is-target" : "",
        over ? "is-drop-target" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-anchor={anchor}
      data-background={background}
      style={{
        ["--anchor-intensity" as string]: String(intensity),
        ["--anchor-blur" as string]: `${Math.round(intensity * 40)}px`,
        ...(board.color ? { ["--anchor-color" as string]: board.color } : {}),
      }}
      onDragOver={(e) => {
        // Decided from the drag in flight rather than from the DataTransfer: getData returns nothing
        // during dragover in every browser — only drop may read it — so inspecting it here always
        // came back empty, the guard bailed, preventDefault never ran and no drop was ever allowed.
        if (!editing || !isTarget) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = dragging?.kind ? "copy" : "move";
        setOver(true);

        if (dragging?.kind && dragging.id) {
          insertPreviewWidget(dragging.id, dragging.kind, anchor);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setOver(false);
      }}
      onDrop={(e) => {
        setOver(false);
        if (!editing) return;

        const payload = readWidgetDrag(e.dataTransfer);
        if (!payload) return;
        e.preventDefault();

        if (payload.kind && payload.id) {
          finalizePreview();
          return;
        }

        if (payload.kind) {
          setAnchor(anchor, (prev) => addWidget(prev, payload.kind!));
          return;
        }

        const source = payload.anchor ?? dragging?.anchor;
        if (payload.id && source && source !== anchor) {
          moveWidget(payload.id, source, anchor);
        }
      }}
    >
      {editing && (
        <button
          type="button"
          ref={gear}
          className="anchor-settings"
          aria-label={`${t("board.settings")} · ${t(`anchors.${anchor}`)}`}
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen(!settingsOpen)}
        >
          ⚙
        </button>
      )}

      {/* The rail lives inside the anchor, not around it: a background set on the anchor should
          reach the page's edges even though its contents are held to reading width. */}
      <div className={rail ? "page-rail" : undefined}>
        <WidgetBoard
          widgets={widgets}
          flow={board.flow as Flow}
          scroll={board.scroll as Scroll}
          editing={editing}
          anchor={anchor}
          onChange={(next) => setAnchor(anchor, next)}
        />
      </div>

      {/* Named while a drag is in flight, so the rails are findable rather than guessed at. */}
      {isTarget && <span className="anchor-guide">{t(`anchors.${anchor}`)}</span>}

      {settingsOpen && (
        <BoardInspector anchor={anchor} trigger={gear} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}
