import type { Anchor } from "../Types";

/** The drag payload that lets a widget cross from one anchor's board to another. */
export const DRAG_TYPE = "application/x-hisuiki-widget";

export interface WidgetDrag {
  id: string;
  anchor?: Anchor;
}

export function readWidgetDrag(data: DataTransfer): WidgetDrag | null {
  try {
    const raw = data.getData(DRAG_TYPE);
    if (!raw) return null;
    const value = JSON.parse(raw) as WidgetDrag;
    return typeof value?.id === "string" ? value : null;
  } catch {
    return null;
  }
}
