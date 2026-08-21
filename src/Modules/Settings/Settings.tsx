import { useEffect, useState } from "react";
import type { ProfilePageSummary } from "../../Services/types";
import InfoBubble from "../../Common/Components/InfoBubble/InfoBubble";
import Skeleton from "../../Common/Components/Skeleton/Skeleton";
import { useAuth } from "../../Services/auth";
import { apiUrl } from "../../Services/config";
import { fetchMyProfile, updateMyProfile, ProfileData } from "../../Services/profile";

export interface SettingsProps {
  isJapanese: boolean;
}

export default function Settings({ isJapanese }: SettingsProps) {
  const auth = useAuth();
  
  const [, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [handle, setHandle] = useState("");
  const [headline, setHeadline] = useState("");
  const [bio, setBio] = useState("");
  const [customCss, setCustomCss] = useState("");
  const [accentColor, setAccentColor] = useState("");
  const [wallpaperPath, setWallpaperPath] = useState("");
  const [showProfileLink, setShowProfileLink] = useState(true);
  const [headerLinks, setHeaderLinks] = useState("");
  const [pages, setPages] = useState<ProfilePageSummary[]>([]);

  useEffect(() => {
    if (!auth.initializing && !auth.isSignedIn) {
      auth.redirectToLogin();
    }
  }, [auth.isSignedIn, auth.initializing, auth]);

  useEffect(() => {
    let active = true;
    if (auth.isSignedIn) {
      fetchMyProfile()
        .then(async (data) => {
          if (active) {
            setProfile(data);
            setHandle(data.handle || "");
            setHeadline(data.headline || "");
            setBio(data.bio || "");
            setCustomCss(data.customCss || "");
            setAccentColor(data.accentColor || "");
            setWallpaperPath(data.wallpaperPath || "");
            setShowProfileLink(data.showProfileLink !== false);
            setHeaderLinks(data.headerLinks ? JSON.stringify(data.headerLinks, null, 2) : "[]");

            const pagesRes = await fetch(apiUrl("/api/profile/me/pages"), { credentials: "include" });
            if (pagesRes.ok) {
              const pagesData = await pagesRes.json();
              setPages(pagesData.pages || []);
            }

            setLoading(false);
          }
        })
        .catch((err: unknown) => {
          if (active) {
            setError(err instanceof Error ? err.message : String(err));
            setLoading(false);
          }
        });
    }
    return () => { active = false; };
  }, [auth.isSignedIn]);

  if (auth.initializing || (!auth.isSignedIn && loading)) {
    return <div className="file-content" data-phase="loading"><Skeleton width="100%" height="200px" /></div>;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const data = await updateMyProfile({
        handle: handle.trim() || null,
        headline: headline.trim() || null,
        bio: bio.trim() || null,
        customCss: customCss.trim() || null,
        accentColor: accentColor.trim() || null,
        wallpaperPath: wallpaperPath.trim() || null,
        showProfileLink,
        headerLinks: (() => { try { return JSON.parse(headerLinks || "[]"); } catch { throw new Error("Invalid JSON in Header Links"); } })(),
      });
      setProfile(data);
      setHandle(data.handle || "");
      setHeadline(data.headline || "");
      setBio(data.bio || "");
            setCustomCss(data.customCss || "");
            setAccentColor(data.accentColor || "");
            setWallpaperPath(data.wallpaperPath || "");
            setShowProfileLink(data.showProfileLink !== false);
            setHeaderLinks(data.headerLinks ? JSON.stringify(data.headerLinks, null, 2) : "[]");

            const pagesRes = await fetch(apiUrl("/api/profile/me/pages"), { credentials: "include" });
            if (pagesRes.ok) {
              const pagesData = await pagesRes.json();
              setPages(pagesData.pages || []);
            }

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="file-content" data-phase="ready">
      <h1>{isJapanese ? "プロフィール設定" : "Profile Settings"}</h1>
      {error && <InfoBubble title={error} className="md-component-danger" />}
      
      {loading ? (
        <Skeleton width="100%" height="200px" />
      ) : (
        <form onSubmit={(e) => void submit(e)} style={{ marginTop: "2rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <label className="photo-field">
            <span>{isJapanese ? "ハンドル" : "Handle (e.g. your-name)"}</span>
            <input
              className="editor-commit-input"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              pattern="^[a-z0-9-]+$"
              title="Lowercase alphanumeric and hyphens only"
              minLength={3}
              maxLength={30}
            />
          </label>
          <label className="photo-field">
            <span>{isJapanese ? "ヘッドライン" : "Headline"}</span>
            <input
              className="editor-commit-input"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              maxLength={100}
            />
          </label>
          <label className="photo-field">
            <span>{isJapanese ? "自己紹介" : "Bio"}</span>
            <textarea
              className="editor-commit-input"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              style={{ minHeight: "100px", resize: "vertical" }}
              maxLength={500}
            />
          </label>
          
          
          <hr style={{ margin: "2rem 0", borderColor: "var(--color-surface-veil)" }} />
          <h2>{isJapanese ? "カスタマイズ" : "Customization"}</h2>
          
          
          <label className="photo-field">
            <span>{isJapanese ? "ヘッダーリンク (JSON)" : "Header Links (JSON)"}</span>
            <textarea
              className="editor-commit-input"
              value={headerLinks}
              onChange={(e) => setHeaderLinks(e.target.value)}
              style={{ minHeight: "100px", resize: "vertical", fontFamily: "monospace" }}
              placeholder='[{"url": "https://twitter.com/...", "label": "Twitter"}]'
            />
          </label>
<label className="photo-field">
            <span>{isJapanese ? "プロフィールリンクを表示" : "Show Profile Link in Header"}</span>
            <input
              type="checkbox"
              checked={showProfileLink}
              onChange={(e) => setShowProfileLink(e.target.checked)}
              style={{ width: "auto", marginLeft: "1rem" }}
            />
          </label>
          
          
          <label className="photo-field">
            <span>{isJapanese ? "壁紙のURL" : "Wallpaper URL"}</span>
            <input
              className="editor-commit-input"
              value={wallpaperPath}
              onChange={(e) => setWallpaperPath(e.target.value)}
              placeholder="/assets/default2.png or https://..."
            />
          </label>

          <label className="photo-field">
            <span>{isJapanese ? "アクセントカラー (HEX)" : "Accent Color (HEX, e.g. #ff0000)"}</span>
            <input
              className="editor-commit-input"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              pattern="^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$"
            />
          </label>
          
          <label className="photo-field">
            <span>{isJapanese ? "カスタム CSS" : "Custom CSS (Scoped automatically)"}</span>
            <textarea
              className="editor-commit-input"
              value={customCss}
              onChange={(e) => setCustomCss(e.target.value)}
              style={{ minHeight: "150px", resize: "vertical", fontFamily: "monospace" }}
            />
          </label>

          <div className="editor-actions">
            {saving && <span className="editor-status">{isJapanese ? "保存中…" : "Saving..."}</span>}
            <button type="submit" className="editor-btn editor-btn-primary" disabled={saving}>
              {isJapanese ? "保存する" : "Save Changes"}
            </button>
          </div>
        
          
          <hr style={{ margin: "2rem 0", borderColor: "var(--color-surface-veil)" }} />
          <h2>{isJapanese ? "ページ" : "Pages"}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {pages.length === 0 && <span style={{ color: "var(--color-text-muted)" }}>{isJapanese ? "ページがありません" : "No pages yet."}</span>}
            {pages.map(p => (
              <div key={p.id} style={{ padding: "0.5rem 1rem", border: "1px solid var(--color-surface-veil)", borderRadius: "4px", display: "flex", justifyContent: "space-between" }}>
                <span><strong>{p.title || p.slug}</strong> <span style={{color: "var(--color-text-muted)", fontSize: "0.9em"}}>(/{p.slug})</span></span>
              </div>
            ))}
          </div>
<hr style={{ margin: "2rem 0", borderColor: "var(--color-surface-veil)" }} />
          <h2 style={{ color: "var(--color-danger)" }}>{isJapanese ? "詳細設定" : "Advanced"}</h2>
          <div style={{ padding: "1rem", border: "1px solid var(--color-danger)", borderRadius: "8px", background: "var(--color-danger-bg)", marginTop: "1rem" }}>
            <p style={{ marginTop: 0 }}>{isJapanese ? "アカウントを削除すると、すべての投稿と設定が完全に消去されます。元に戻すことはできません。" : "Deleting your account will permanently remove all your posts and settings. This cannot be undone."}</p>
            <button 
              type="button" 
              className="editor-btn" 
              style={{ background: "var(--color-danger)", color: "white", borderColor: "var(--color-danger)" }}
              onClick={async () => {
                if (window.confirm(isJapanese ? "本当にアカウントを削除しますか？" : "Are you sure you want to delete your account?")) {
                  try {
                    await fetch(apiUrl('/api/profile/me'), { method: 'DELETE', credentials: 'include' });
                    window.location.href = '/';
                  } catch (e) {
                    setError(String(e));
                  }
                }
              }}
            >
              {isJapanese ? "アカウントを削除する" : "Delete Account"}
            </button>
          </div>

        </form>
      )}
    </div>
  );
}
