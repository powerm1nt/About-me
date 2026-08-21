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
  showProfileLink: boolean;
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
