import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePageLayout } from "../../../Services/pageLayout";
import type { AnchorRegionProps, Flow, Scroll } from "../../../Types";
import BoardInspector from "../Inspector/BoardInspector";
import WidgetBoard from "../WidgetBoard/WidgetBoard";

/** One of the page's five positions, and whatever has been put there. */
export default function AnchorRegion({ anchor, className }: AnchorRegionProps) {
  const { t } = useTranslation();
  const { anchors, setAnchor, boards, editing } = usePageLayout();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const gear = useRef<HTMLButtonElement>(null);

  const widgets = anchors[anchor] ?? [];
  const board = boards[anchor];

  if (widgets.length === 0 && !editing) return null;

  return (
    <div className={`anchor-region ${className ?? ""}`.trim()} data-anchor={anchor}>
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
        onChange={(next) => setAnchor(anchor, next)}
      />

      {settingsOpen && (
        <BoardInspector anchor={anchor} trigger={gear} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}
