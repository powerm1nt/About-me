import { apiUrl } from "./config";
import { readErrorMessage } from "./api";
import type { HeaderLink } from "./types";
import type { HeaderItemState } from "./headerLayout";

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

/** Every part of a profile is a widget: what it shows, how wide it is, and whether it is shown. */
export type WidgetKind = "identity" | "links" | "bio" | "heatmap" | "timeline" | "text";

/** Widths, in the phone-home-screen sense rather than pixels. */
export type WidgetSize = "small" | "medium" | "large";

export interface Widget {
  id: string;
  kind: WidgetKind;
  size: WidgetSize;
  /** Kept on the board but not shown, so hiding something is not the same as deleting it. */
  hidden?: boolean;
  /** Per-kind settings — the heading and text of a text widget, for instance. */
  props?: Record<string, string | number | boolean>;
}

/**
 * The serialised board. Order plus size is the whole arrangement: there are no coordinates, so the
 * same document reflows onto a phone instead of preserving a desktop composition nothing can show.
 */
export interface ProfileLayout {
  widgets?: Widget[];
  /**
   * The header strip's arrangement — ids and hidden flags, in order. Kept alongside the board
   * because it is the same act of arranging, and because the header's items are derived from the
   * profile anyway. See Services/headerLayout.
   */
  header?: HeaderItemState[];
  /** Bumped when the shape changes, so an older document can be recognised rather than misread. */
  version?: number;
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
