import type { HeaderLink } from "./types";

/**
 * The header is a board too.
 *
 * The strip across the top is not a fixed run of chrome with the person's own links appended to the
 * end — every item in it, the app's own navigation and the account tile included, is something that
 * can be reordered and (mostly) hidden. The model is deliberately the same one the profile board
 * uses: order plus a hidden flag, no coordinates, so it reflows onto a narrow screen instead of
 * preserving a composition only a wide one can show.
 *
 * What is stored is only the arrangement. The items themselves are derived from what exists right
 * now — the app's routes, and the links on the profile — so a stored document can never resurrect a
 * deleted link or lose a route added since it was written.
 */

export type HeaderItemKind = "nav" | "link" | "avatar";

/** One entry in the stored arrangement. Ids are derived, never invented by the editor. */
export interface HeaderItemState {
  id: string;
  hidden?: boolean;
}

export interface HeaderItem extends HeaderItemState {
  kind: HeaderItemKind;
  /** Present on a "link" item: which of the profile's own links this is. */
  link?: HeaderLink;
}

/**
 * The account tile cannot be hidden. It is the only way to reach sign-out, settings and customize,
 * so a board that hid it would leave no way to get the board back.
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
 * the item still exists, duplicates collapse to the first, and anything present but unmentioned is
 * appended in its default position — so the header always shows everything exactly once.
 */
export function readHeaderLayout(
  stored: HeaderItemState[] | null | undefined,
  links: HeaderLink[],
): HeaderItem[] {
  const present = new Map(headerItems(links).map((item) => [item.id, item]));
  const ordered: HeaderItem[] = [];
  const seen = new Set<string>();

  for (const entry of Array.isArray(stored) ? stored : []) {
    if (!entry || typeof entry.id !== "string" || seen.has(entry.id)) continue;

    const item = present.get(entry.id);
    if (!item) continue;

    seen.add(entry.id);
    ordered.push({ ...item, hidden: item.id === AVATAR_ID ? false : entry.hidden === true });
  }

  for (const [id, item] of present) {
    if (!seen.has(id)) ordered.push(item);
  }

  return ordered;
}

/** The arrangement to store: ids and hidden flags only, never the derived content. */
export const writeHeaderLayout = (items: HeaderItem[]): HeaderItemState[] =>
  items.map((item) => (item.hidden ? { id: item.id, hidden: true } : { id: item.id }));

/** Moves an item to another position, returning a new array. */
export function moveHeaderItem(items: HeaderItem[], from: number, to: number): HeaderItem[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;

  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved) next.splice(to, 0, moved);
  return next;
}
