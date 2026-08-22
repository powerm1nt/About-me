import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { addWidget } from "../../../Services/layout";
import { usePageLayout } from "../../../Services/pageLayout";
import { readWidgetDrag } from "../../../Services/widgetDrag";
import type { AnchorRegionProps, Flow, Scroll } from "../../../Types";
import BoardInspector from "../Inspector/BoardInspector";
import WidgetBoard from "../WidgetBoard/WidgetBoard";

/** One of the page's five positions, and whatever has been put there. */
export default function AnchorRegion({ anchor, className }: AnchorRegionProps) {
  const { t } = useTranslation();
  const { anchors, setAnchor, boards, editing, moveWidget, dragging } = usePageLayout();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [over, setOver] = useState(false);
  const gear = useRef<HTMLButtonElement>(null);

  const widgets = anchors[anchor] ?? [];
  const board = boards[anchor];
  const enabled = board.enabled !== false;

  // Somewhere the dragged thing could go: a new widget can land anywhere, a moved one anywhere but
  // the board it came from.
  const isTarget = Boolean(dragging && (dragging.kind || dragging.anchor !== anchor));

  // A disabled anchor is not a place widgets can be. An empty one shows only while arranging, so
  // the rails are somewhere to drop onto rather than four empty strips on a finished page.
  if (!enabled) return null;
  if (widgets.length === 0 && !editing) return null;

  // Painted only when there is something to paint behind.
  const background = widgets.length > 0 ? (board.background ?? "none") : "none";
  const intensity = board.intensity ?? 0.55;

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
        if (!editing) return;
        const payload = readWidgetDrag(e.dataTransfer);
        // A new widget from the gallery, or one being moved here from somewhere else.
        if (!payload || (payload.id && payload.anchor === anchor)) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        if (!editing) return;

        const payload = readWidgetDrag(e.dataTransfer);
        if (!payload) return;
        e.preventDefault();

        if (payload.kind) {
          setAnchor(anchor, (prev) => addWidget(prev, payload.kind!));
          return;
        }

        if (payload.id && payload.anchor && payload.anchor !== anchor) {
          moveWidget(payload.id, payload.anchor, anchor);
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

      <WidgetBoard
        widgets={widgets}
        flow={board.flow as Flow}
        scroll={board.scroll as Scroll}
        editing={editing}
        anchor={anchor}
        onChange={(next) => setAnchor(anchor, next)}
      />

      {/* Named while a drag is in flight, so the rails are findable rather than guessed at. */}
      {isTarget && <span className="anchor-guide">{t(`anchors.${anchor}`)}</span>}

      {settingsOpen && (
        <BoardInspector anchor={anchor} trigger={gear} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}
