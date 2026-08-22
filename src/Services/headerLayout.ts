import type { HeaderLink } from "./types";

/**
 * The header is a board too.
 *
 * The strip across the top is not a fixed run of chrome with the person's own links appended to the
 * end — every item in it, the app's own navigation and the account tile included, is something that
 * can be reordered and, with the one exception below, taken off. The model is deliberately the same
 * one the profile board uses: order alone, no coordinates, so it reflows onto a narrow screen
 * instead of preserving a composition only a wide one can show.
 *
 * What is stored is only the arrangement. The items themselves are derived from what exists right
 * now — the app's routes, and the links on the profile — so a stored document can never resurrect a
 * deleted link or invent a route.
 */

export type HeaderItemKind = "nav" | "link" | "avatar";

/** One entry in the stored arrangement. Ids are derived, never invented by the editor. */
export interface HeaderItemState {
  id: string;
}

export interface HeaderItem extends HeaderItemState {
  kind: HeaderItemKind;
  /** Present on a "link" item: which of the profile's own links this is. */
  link?: HeaderLink;
}

/**
 * The account tile cannot be removed. It is the only way to reach sign-out, settings and customize,
 * so a header without it would leave no way to get the header back.
 */
export const AVATAR_ID = "avatar";

export const NAV_IDS = ["nav:home", "nav:explore", "nav:media"] as const;

/**
 * A stable id for one of the profile's links.
 *
 * Derived from the link rather than assigned, because the links themselves are stored as a plain
 * array with no identity of their own. Two links to the same place under different names stay
 * distinct; renaming one reads as a new item, which is the honest outcome — the stored order refers
 * to something that no longer exists.
 */
export const linkId = (link: HeaderLink): string => `link:${link.href} ${link.label}`;

/** Every item the header could show right now, in the order it would show them by default. */
export function headerItems(links: HeaderLink[]): HeaderItem[] {
  return [
    ...NAV_IDS.map((id): HeaderItem => ({ id, kind: "nav" })),
    ...links.map((link): HeaderItem => ({ id: linkId(link), kind: "link", link })),
    { id: AVATAR_ID, kind: "avatar" },
  ];
}

/**
 * Reconciles a stored arrangement against the items that actually exist.
 *
 * The document is untrusted in the same way the profile board's is: it may predate a link being
 * deleted or a route being added, or have been edited by hand. Stored entries are kept only where
 * the item still exists, and duplicates collapse to the first.
 *
 * What is appended afterwards differs by kind, and the difference is the whole point. A link is
 * derived from the profile's own list, so one that is not mentioned is new and belongs on the end.
 * The navigation is a fixed set, so an unmentioned entry is one that was deliberately taken off —
 * appending it would undo that. Nav items are therefore filled in only for a header nobody has
 * arranged yet. The account tile is always present, whatever the document says.
 */
export function readHeaderLayout(
  stored: HeaderItemState[] | null | undefined,
  links: HeaderLink[],
): HeaderItem[] {
  const entries = Array.isArray(stored) ? stored : [];
  const arranged = entries.length > 0;

  const present = new Map(headerItems(links).map((item) => [item.id, item]));
  const ordered: HeaderItem[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    if (!entry || typeof entry.id !== "string" || seen.has(entry.id)) continue;

    const item = present.get(entry.id);
    if (!item) continue;

    seen.add(entry.id);
    ordered.push(item);
  }

  for (const [id, item] of present) {
    if (seen.has(id)) continue;
    if (item.kind === "nav" && arranged) continue;
    ordered.push(item);
  }

  return ordered;
}

/** The arrangement to store: ids in order, never the derived content. */
export const writeHeaderLayout = (items: HeaderItem[]): HeaderItemState[] =>
  items.map((item) => ({ id: item.id }));

/** Moves an item to another position, returning a new array. */
export function moveHeaderItem(items: HeaderItem[], from: number, to: number): HeaderItem[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;

  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved) next.splice(to, 0, moved);
  return next;
}

/**
 * Takes an item off the header.
 *
 * Removing a nav item is recorded by its absence, which readHeaderLayout honours once the header has
 * been arranged at all. A link is not removed here: the link itself lives on the profile, and taking
 * it off the header means deleting it, which is the caller's job.
 */
export const removeHeaderItem = (items: HeaderItem[], id: string): HeaderItem[] =>
  id === AVATAR_ID ? items : items.filter((item) => item.id !== id);
