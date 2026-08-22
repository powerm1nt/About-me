import type { ReactNode } from "react";
import type { Widget, WidgetKind } from "../Services/profile";

/**
 * How a widget is declared.
 *
 * Every widget in the app is one of these and nothing else: a kind, and a component that renders it.
 * Adding one means writing a file in this directory and naming it in the registry — there is no
 * second place that has to learn about it, no switch statement in a page, and no module that is a
 * widget in some places and a component in others.
 *
 * The metadata half of a declaration — the label, the sizes it supports, whether removing it should
 * ask first — lives in Services/layout's WIDGETS table rather than here. That is deliberate: the
 * layout engine reads and writes stored documents on its own, and pulling React components into it
 * would make the registry import the board that renders containers, which imports the registry. The
 * spec is data; this is the view of it.
 */
export interface WidgetProps {
  /** The stored widget: its size, its settings, and for a container what is inside it. */
  widget: Widget;
  /** True while the page is being arranged, which is when a widget may offer its own editing. */
  editing: boolean;
  /** Replaces this widget in the document — how a widget edits its own settings. */
  onChange: (next: Widget) => void;
  /**
   * A container's contents, already rendered as a board. Given to the widget rather than built by it
   * so that nesting, dragging and the gallery all stay the board's business.
   */
  children?: ReactNode;
}

/** A widget's view. Returning null means "nothing to show", and the board leaves it out. */
export type WidgetComponent = (props: WidgetProps) => ReactNode;

export type WidgetRegistry = Record<WidgetKind, WidgetComponent>;
