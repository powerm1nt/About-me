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
  /** One line for the gallery, shown only when the live preview has nothing to show. */
  description: { en: string; ja: string };
  /**
   * Whether removing one should ask first. Any widget can be added again from the gallery, so this
   * is not about permanence — it is about how much is thrown away. A text widget holds a few words
   * you can retype; a timeline or a heatmap is a piece of the page's structure, and losing it to a
   * misplaced click is the kind of mistake worth one question.
   */
  confirmRemove: boolean;
  defaultSize: WidgetSize;
  /** Sizes that make sense — a timeline at one column is unreadable. */
  sizes: WidgetSize[];
}

export const WIDGETS: Record<WidgetKind, WidgetSpec> = {
  identity: {
    label: { en: "Name and avatar", ja: "名前とアバター" },
    description: { en: "Your avatar, name, handle and headline.", ja: "アバター、名前、ハンドル、見出し。" },
    confirmRemove: true,
    defaultSize: "large",
    sizes: ["medium", "large"],
  },
  links: {
    label: { en: "Links", ja: "リンク" },
    description: { en: "The links you list on your profile.", ja: "プロフィールに並べるリンク。" },
    confirmRemove: true,
    defaultSize: "medium",
    sizes: ["small", "medium", "large"],
  },
  bio: {
    label: { en: "Bio (README)", ja: "自己紹介 (README)" },
    description: { en: "Your README post, shown as the bio.", ja: "READMEの投稿を自己紹介として表示。" },
    confirmRemove: true,
    defaultSize: "large",
    sizes: ["medium", "large"],
  },
  heatmap: {
    label: { en: "Activity", ja: "アクティビティ" },
    description: { en: "A year of your posting activity.", ja: "1年間の投稿アクティビティ。" },
    confirmRemove: true,
    // The grid is 53 columns wide; anything narrower than full width just scrolls awkwardly.
    defaultSize: "large",
    sizes: ["large"],
  },
  timeline: {
    label: { en: "Posts and media", ja: "投稿とメディア" },
    description: { en: "Everything you have posted, in tabs.", ja: "投稿とメディアをタブで表示。" },
    confirmRemove: true,
    defaultSize: "large",
    sizes: ["large"],
  },
  text: {
    label: { en: "Text", ja: "テキスト" },
    description: { en: "A heading and some words of your own.", ja: "自分で書く見出しと本文。" },
    confirmRemove: false,
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
 * Unknown widget kinds are dropped, sizes are clamped to what the widget supports, and repeated ids
 * are collapsed, since two widgets sharing an id cannot be told apart by a drag or a delete.
 *
 * A stored board is authoritative — whatever it says is the whole page. The default board is used
 * only when there is no widget list at all, which means a profile nobody has arranged yet. An empty
 * list is a different thing entirely: it is a board someone has emptied, and refilling it would be
 * undoing their work rather than helping.
 */
export function readLayout(layout: ProfileLayout | null | undefined): Widget[] {
  const stored = layout?.widgets;
  if (!Array.isArray(stored)) return DEFAULT_WIDGETS.map((widget) => ({ ...widget }));

  const seen = new Set<string>();
  const widgets: Widget[] = [];

  for (const widget of stored) {
    if (!widget || typeof widget.id !== "string" || !isKind(widget.kind)) continue;
    if (seen.has(widget.id)) continue;
    seen.add(widget.id);

    const spec = WIDGETS[widget.kind];
    widgets.push({
      id: widget.id,
      kind: widget.kind,
      size: spec.sizes.includes(widget.size) ? widget.size : spec.defaultSize,
      props: widget.props,
    });
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

/** Takes a widget off the board. It can always be added again from the gallery. */
export const removeWidget = (widgets: Widget[], id: string): Widget[] =>
  widgets.filter((widget) => widget.id !== id);

/**
 * A fresh id.
 *
 * Every widget gets one, including the structural kinds: a profile may hold as many timelines or
 * text panels as its owner wants, so identity cannot come from the kind.
 */
const newId = (): string =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Puts a widget on the board from the gallery, at the end where it can be seen and then moved. */
export const addWidget = (widgets: Widget[], kind: WidgetKind): Widget[] => [
  ...widgets,
  { id: newId(), kind, size: WIDGETS[kind].defaultSize, props: {} },
];

/** Copies a widget, its size and its contents, and drops the copy in beside the original. */
export function duplicateWidget(widgets: Widget[], id: string): Widget[] {
  const index = widgets.findIndex((widget) => widget.id === id);
  if (index === -1) return widgets;

  const source = widgets[index]!;
  const copy: Widget = {
    id: newId(),
    kind: source.kind,
    size: source.size,
    props: source.props ? { ...source.props } : undefined,
  };

  const next = [...widgets];
  next.splice(index + 1, 0, copy);
  return next;
}

/** The next size in the widget's own list, wrapping — what tapping a resize control does. */
export function cycleSize(widget: Widget): WidgetSize {
  const sizes = WIDGETS[widget.kind].sizes;
  const index = sizes.indexOf(widget.size);
  return sizes[(index + 1) % sizes.length] ?? widget.size;
}
