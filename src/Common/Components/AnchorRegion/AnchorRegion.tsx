import type { Flow } from "../../../Services/layout";
import { usePageLayout } from "../../../Services/pageLayout";
import type { Anchor } from "../../../Services/profile";
import WidgetBoard from "../WidgetBoard/WidgetBoard";

export interface AnchorRegionProps {
  anchor: Anchor;
  /** How the anchor itself lays its widgets out, before any container inside it takes over. */
  flow?: Flow;
  className?: string;
}

/**
 * One of the page's five positions, and whatever has been put there.
 *
 * This is the whole of what used to be Header and Footer. Neither exists any more: the top anchor
 * holds a container of navigation widgets, the bottom anchor holds a container with the brand and
 * the colophon, and nothing in this file knows the difference. Moving that container from `top` to
 * `bottom` moves the header to the foot of the page, which is the point of anchors being the only
 * fixed vocabulary.
 *
 * An empty anchor renders nothing at all rather than an empty box, so the four unused positions on
 * an ordinary page cost no layout.
 */
export default function AnchorRegion({ anchor, flow = "column", className }: AnchorRegionProps) {
  const { anchors, setAnchor, editing } = usePageLayout();
  const widgets = anchors[anchor] ?? [];

  if (widgets.length === 0 && !editing) return null;

  return (
    <div className={`anchor-region ${className ?? ""}`.trim()} data-anchor={anchor}>
      <WidgetBoard
        widgets={widgets}
        flow={flow}
        editing={editing}
        onChange={(next) => setAnchor(anchor, next)}
      />
    </div>
  );
}
