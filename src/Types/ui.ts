import type { ReactNode, RefObject } from "react";
import type { Anchor, Flow, Scroll, Widget, WidgetKind } from "./widget";

export interface WidgetBoardProps {
  widgets: Widget[];
  flow?: Flow;
  scroll?: Scroll;
  editing?: boolean;
  /** Which anchor this board belongs to, so a drag can be recognised by another one. */
  anchor?: Anchor;
  /** Takes an updater as well as a list, so change handlers can be stable. */
  onChange?: (widgets: Widget[] | ((prev: Widget[]) => Widget[])) => void;
}

export interface AnchorRegionProps {
  anchor: Anchor;
  className?: string;
  /** Centres the board in a reading-width column while the anchor itself spans the page. */
  rail?: boolean;
}

export interface WidgetGalleryProps {
  onAdd: (kind: WidgetKind) => void;
}

/** One tab of an Inspector panel. Content is a callback so it is built only when shown. */
export interface InspectorTab {
  id: string;
  label: string;
  render: () => ReactNode;
}

export interface InspectorProps {
  title: string;
  subtitle?: string;
  anchor: RefObject<HTMLElement | null>;
  align?: "left" | "right";
  tabs: InspectorTab[];
  onClose: () => void;
}

export interface WidgetInspectorProps {
  widget: Widget;
  anchor: RefObject<HTMLElement | null>;
  onChange: (next: Widget) => void;
  onClose: () => void;
}

export interface BoardInspectorProps {
  anchor: Anchor;
  trigger: RefObject<HTMLElement | null>;
  onClose: () => void;
}

export interface MenuItem {
  label: string;
  onSelect?: () => void;
  items?: MenuItem[];
  danger?: boolean;
}

export interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export interface AnchoredProps {
  anchor: RefObject<HTMLElement | null>;
  align?: "left" | "right";
  className?: string;
  gap?: number;
  children?: ReactNode;
}

export interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}
