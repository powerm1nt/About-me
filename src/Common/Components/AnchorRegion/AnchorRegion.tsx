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

  // Hidden on a finished page, but never while arranging: the gear is the only way back on, so
  // removing it with the rest would make disabling an anchor a one-way door.
  if (!enabled && !editing) return null;
  if (widgets.length === 0 && !editing) return null;

  // Painted only when there is something to paint behind.
  const background = widgets.length > 0 ? (board.background ?? "none") : "none";
  const intensity = board.intensity ?? 0.55;

  if (!enabled) {
    return (
      <div className="anchor-region is-disabled" data-anchor={anchor}>
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
