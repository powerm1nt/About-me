import { apiUrl } from "./config";
import { readErrorMessage } from "./api";
import type { HeaderLink } from "./types";

const send = (init: RequestInit = {}): RequestInit => ({ credentials: "include", ...init });

const jsonInit = (method: string, body: unknown): RequestInit =>
  send({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return (await response.json()) as T;
}

export interface ProfileData {
  userId: string;
  handle: string | null;
  headline: string | null;
  bio: string | null;
  /** The author's own source. Present on /me only; a public lookup returns scopedCss instead. */
  customCss: string | null;
  /** Filtered and confined to the profile container by the server. */
  scopedCss?: string;
  wallpaperPath: string | null;
  avatarPath: string | null;
  accentColor: string | null;
  headerLinks: HeaderLink[];
  /** Shown on the profile itself, separate from the header's navigation links. */
  profileLinks: HeaderLink[];
  publicEmail: string | null;
  location: string | null;
  pronouns: string | null;
  showProfileLink: boolean;
  /** The visual editor's serialised arrangement; empty until the profile has been customised. */
  layout: ProfileLayout;
  /** Present on a public lookup, which joins the account for its display name and avatar. */
  user?: { id: string; name: string; image: string | null };
}

/**
 * Every part of a page is a widget.
 *
 * There is no chrome. What used to be the header is a container of navigation widgets that happens
 * to be anchored to the top, and it stops being a header the moment somebody moves it.
 */
export type WidgetKind =
  | "container"
  | "nav"
  | "link"
  | "account"
  | "brand"
  | "colophon"
  | "identity"
  | "links"
  | "bio"
  | "heatmap"
  | "timeline"
  | "text"
  | "webamp";

/** Widths, in the phone-home-screen sense rather than pixels. */
export type WidgetSize = "small" | "medium" | "large";

/**
 * Where on the page something sits.
 *
 * The one fixed vocabulary in an otherwise arrangeable page. A widget is not a header because of
 * what it is — it is a header because it is anchored to the top — so the positions need names even
 * though nothing else does.
 */
export type Anchor = "top" | "left" | "center" | "right" | "bottom";

/**
 * How one widget looks, as set in the Inspector.
 *
 * Every field but the stylesheet is a number or one of a fixed set of words, so it can be clamped on
 * the way in and assigned to a custom property on the way out. See Services/widgetStyle.
 */
export interface WidgetStyle {
  /** Backdrop blur in pixels. 0 turns the frosting off entirely. */
  blur?: number;
  /** How opaque the widget's own ground is, 0 to 1. */
  opacity?: number;
  /** Metro edge treatment. */
  border?: "none" | "hairline" | "solid" | "accent";
  /** A drop shadow, which is what lifts an anchored bar off the page behind it. */
  shadow?: "none" | "soft" | "hard";
  /** Overrides the accent colour for this widget and everything inside it. */
  accent?: string;
  /** What the author wrote in the Inspector's Advanced tab. Never rendered as-is. */
  css?: string;
  /**
   * The server's confined version of `css`, scoped to this widget alone. This is the only form the
   * page ever injects: the raw source could restyle the whole app, or somebody else's profile.
   */
  scopedCss?: string;
}

export interface Widget {
  id: string;
  kind: WidgetKind;
  size: WidgetSize;
  /** Per-kind settings — a text widget's words, a container's flow, a nav widget's target. */
  props?: Record<string, string | number | boolean>;
  /** How it looks. Absent means the app's own styling. */
  style?: WidgetStyle;
  /** What is inside, for a container. Leaf widgets have none. */
  children?: Widget[];
}

export type AnchoredLayout = Record<Anchor, Widget[]>;

/**
 * The serialised page. Anchors, then order, then size: there are no coordinates, so the same
 * document reflows onto a phone instead of preserving a desktop composition nothing can show.
 */
export interface ProfileLayout {
  anchors?: Partial<AnchoredLayout>;
  /** Bumped when the shape changes, so an older document can be recognised rather than misread. */
  version?: number;

  /** Written before anchors existed: a flat board, which is now the centre anchor. Read once. */
  widgets?: Widget[];
  /** Written before anchors existed: the header strip's item ids, in order. Read once. */
  header?: { id: string }[];
  /** Read during that migration so the person's own links keep their place in the strip. */
  headerLinks?: HeaderLink[];
}

export async function fetchMyProfile(): Promise<ProfileData> {
  const response = await fetch(apiUrl("/api/profile/me"), send());
  return readJson<ProfileData>(response);
}

export async function updateMyProfile(data: Partial<ProfileData>): Promise<ProfileData> {
  const response = await fetch(apiUrl("/api/profile/me"), jsonInit("PUT", data));
  return readJson<ProfileData>(response);
}

export async function fetchProfile(handle: string): Promise<ProfileData> {
  const response = await fetch(apiUrl(`/api/profile/${encodeURIComponent(handle)}`), send());
  return readJson<ProfileData>(response);
}
