import type { HeaderLink } from "./content";
import type { ProfileLayout } from "./widget";

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
