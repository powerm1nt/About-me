import type { ProfileLayout, Widget, WidgetKind, WidgetSize } from "./profile";

/**
 * A profile is a board of widgets.
 *
 * The model is the one a phone home screen uses: widgets sit in a grid, each occupying a whole
 * number of columns, and the arrangement is their order plus their size — not pixel coordinates.
 * That is a deliberate limit. Coordinates would let someone compose something exact on a desktop
 * that a narrow screen then has to either scale down illegibly or scramble; sizes and order reflow
 * on their own, so the same board works on a phone without a second layout for it.
 */

export const LAYOUT_VERSION = 2;

/** Columns on the widest layout. Narrower screens collapse this in CSS, not here. */
export const GRID_COLUMNS = 4;

/** How many columns each size occupies at full width. */
export const SIZE_SPAN: Record<WidgetSize, number> = {
  small: 1,
  medium: 2,
  large: 4,
};

export const SIZES: WidgetSize[] = ["small", "medium", "large"];

interface WidgetSpec {
  label: { en: string; ja: string };
  /** Structural widgets exist once; the rest can be added repeatedly. */
  repeatable: boolean;
  defaultSize: WidgetSize;
  /** Sizes that make sense — a timeline at one column is unreadable. */
  sizes: WidgetSize[];
}

export const WIDGETS: Record<WidgetKind, WidgetSpec> = {
  identity: {
    label: { en: "Name and avatar", ja: "名前とアバター" },
    repeatable: false,
    defaultSize: "large",
    sizes: ["medium", "large"],
  },
  links: {
    label: { en: "Links", ja: "リンク" },
    repeatable: false,
    defaultSize: "medium",
    sizes: ["small", "medium", "large"],
  },
  bio: {
    label: { en: "Bio (README)", ja: "自己紹介 (README)" },
    repeatable: false,
    defaultSize: "large",
    sizes: ["medium", "large"],
  },
  heatmap: {
    label: { en: "Activity", ja: "アクティビティ" },
    repeatable: false,
    // The grid is 53 columns wide; anything narrower than full width just scrolls awkwardly.
    defaultSize: "large",
    sizes: ["large"],
  },
  timeline: {
    label: { en: "Posts and media", ja: "投稿とメディア" },
    repeatable: false,
    defaultSize: "large",
    sizes: ["large"],
  },
  text: {
    label: { en: "Text", ja: "テキスト" },
    repeatable: true,
    defaultSize: "medium",
    sizes: ["small", "medium", "large"],
  },
};

export const DEFAULT_WIDGETS: Widget[] = [
  { id: "identity", kind: "identity", size: "large" },
  { id: "links", kind: "links", size: "medium" },
  { id: "bio", kind: "bio", size: "large" },
  { id: "heatmap", kind: "heatmap", size: "large" },
  { id: "timeline", kind: "timeline", size: "large" },
];

const isKind = (value: unknown): value is WidgetKind =>
  typeof value === "string" && value in WIDGETS;

/**
 * Reads a stored board into something safe to render.
 *
 * The document is untrusted: it may predate a change to this file, or have been edited by hand.
 * Unknown widget kinds are dropped, sizes are clamped to what the widget supports, duplicates of
 * non-repeatable widgets are collapsed, and anything structural the document omits is appended — so
 * a profile can never lose its own timeline by saving a stale board.
 */
export function readLayout(layout: ProfileLayout | null | undefined): Widget[] {
  const stored = Array.isArray(layout?.widgets) ? layout.widgets : [];

  const seen = new Set<WidgetKind>();
  const widgets: Widget[] = [];

  for (const widget of stored) {
    if (!widget || typeof widget.id !== "string" || !isKind(widget.kind)) continue;

    const spec = WIDGETS[widget.kind];
    if (!spec.repeatable) {
      if (seen.has(widget.kind)) continue;
      seen.add(widget.kind);
    }

    widgets.push({
      id: widget.id,
      kind: widget.kind,
      size: spec.sizes.includes(widget.size) ? widget.size : spec.defaultSize,
      hidden: widget.hidden === true,
      props: widget.props,
    });
  }

  for (const fallback of DEFAULT_WIDGETS) {
    if (!seen.has(fallback.kind)) widgets.push({ ...fallback });
  }

  return widgets;
}

export const writeLayout = (widgets: Widget[]): ProfileLayout => ({
  version: LAYOUT_VERSION,
  widgets,
});

/** Moves a widget to another position, returning a new array. */
export function moveWidget(widgets: Widget[], from: number, to: number): Widget[] {
  if (from === to || from < 0 || to < 0 || from >= widgets.length || to >= widgets.length) {
    return widgets;
  }

  const next = [...widgets];
  const [moved] = next.splice(from, 1);
  if (moved) next.splice(to, 0, moved);
  return next;
}

/** The next size in the widget's own list, wrapping — what tapping a resize control does. */
export function cycleSize(widget: Widget): WidgetSize {
  const sizes = WIDGETS[widget.kind].sizes;
  const index = sizes.indexOf(widget.size);
  return sizes[(index + 1) % sizes.length] ?? widget.size;
}
