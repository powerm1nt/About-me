import type { CSSProperties } from "react";
import type { Widget, WidgetStyle } from "./profile";

/**
 * A widget's own appearance, and how it becomes CSS.
 *
 * Everything here except the custom stylesheet is a number or one of a fixed set of words. That is
 * deliberate: these values come out of a stored document that a determined person can write by hand,
 * so they are read back through a clamp rather than trusted, and they reach the page as custom
 * properties on the element rather than as a string that gets interpolated into CSS. A number that
 * has been forced into a range cannot escape the property it is assigned to.
 *
 * The custom stylesheet is the exception, and it is why `css` and `scopedCss` are two fields. What
 * the author wrote is kept so the editor can show it back to them; what the page renders is only
 * ever the version the server has confined to this widget's own selector. The client never injects
 * the raw source, on this page or anybody else's.
 */

export const BORDERS = ["none", "hairline", "solid", "accent"] as const;
export const SHADOWS = ["none", "soft", "hard"] as const;

export type Border = (typeof BORDERS)[number];
export type Shadow = (typeof SHADOWS)[number];

/** How far the blur slider goes. Past this it stops being frosted glass and becomes a grey panel. */
export const MAX_BLUR = 40;

/** The look a widget has when it has never been touched: the app's own. */
export const DEFAULT_STYLE: Required<Omit<WidgetStyle, "css" | "scopedCss" | "accent">> = {
  blur: 16,
  opacity: 0.55,
  border: "none",
  shadow: "none",
};

const clamp = (value: unknown, min: number, max: number, fallback: number): number => {
  const number = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
};

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

/** Three or six hex digits, and nothing else — this value ends up in a colour property. */
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Reads a stored style into one that is safe to render.
 *
 * Called from readWidget, so every widget the layout engine hands out has already been through it.
 */
export function readStyle(raw: unknown): WidgetStyle | undefined {
  if (!raw || typeof raw !== "object") return undefined;

  const value = raw as Record<string, unknown>;
  const style: WidgetStyle = {
    blur: clamp(value.blur, 0, MAX_BLUR, DEFAULT_STYLE.blur),
    opacity: clamp(value.opacity, 0, 1, DEFAULT_STYLE.opacity),
    border: oneOf(value.border, BORDERS, DEFAULT_STYLE.border),
    shadow: oneOf(value.shadow, SHADOWS, DEFAULT_STYLE.shadow),
  };

  if (typeof value.accent === "string" && HEX.test(value.accent)) style.accent = value.accent;
  if (typeof value.css === "string") style.css = value.css.slice(0, 20_000);
  // Written by the server, never by the editor. A client-supplied value would defeat the point of
  // there being a scoped version at all, so it is only carried when it looks like one.
  if (typeof value.scopedCss === "string") style.scopedCss = value.scopedCss.slice(0, 60_000);

  return style;
}

export const styleOf = (widget: Widget): WidgetStyle => ({ ...DEFAULT_STYLE, ...widget.style });

/** True when the widget looks exactly as it would with no styling at all. */
export const isDefaultStyle = (style: WidgetStyle): boolean =>
  style.blur === DEFAULT_STYLE.blur &&
  style.opacity === DEFAULT_STYLE.opacity &&
  style.border === DEFAULT_STYLE.border &&
  style.shadow === DEFAULT_STYLE.shadow &&
  !style.accent &&
  !style.css?.trim();

/**
 * The custom properties a widget's style sets on its own element.
 *
 * Properties rather than a stylesheet, so the values stay data: the stylesheet decides what a blur
 * radius or a veil opacity means, and this only says how much. Anything a widget contains inherits
 * them, which is how a container's accent reaches the widgets inside it.
 */
export function styleVariables(style: WidgetStyle): CSSProperties {
  const variables: Record<string, string> = {
    "--widget-blur": `${style.blur ?? DEFAULT_STYLE.blur}px`,
    "--widget-veil-alpha": String(style.opacity ?? DEFAULT_STYLE.opacity),
  };

  if (style.accent) {
    variables["--color-accent"] = style.accent;
    variables["--color-accent-strong"] = style.accent;
  }

  return variables as CSSProperties;
}
