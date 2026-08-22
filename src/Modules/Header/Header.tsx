import { useState, useRef, useEffect } from "react";
import ExternalLink from "../../Common/Components/ExternalLink/ExternalLink";
import HeadlineLogo from "../../Common/Components/HeadlineLogo/HeadlineLogo";
import SmartImage from "../../Common/Components/SmartImage/SmartImage";
import { Link, useRouter } from "../../Services/router";
import { fetchMyProfile, updateMyProfile } from "../../Services/profile";
import type { HeaderLink } from "../../Services/types";
import { useAuth, signInHref } from "../../Services/auth";

export interface HeaderProps {
  isJapanese: boolean;
}

export default function Header({ isJapanese }: HeaderProps) {
  const { pathname } = useRouter();
  const auth = useAuth();
  
  
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [myHandle, setMyHandle] = useState<string | null>(null);

  // The signed-in person's own header entries. They live on the profile, so the header is theirs to
  // arrange rather than a fixed strip of the app's choosing.
  const [fetchedLinks, setFetchedLinks] = useState<HeaderLink[]>([]);
  // Someone signed out has no header entries of their own, whatever was last fetched.
  const links = auth.isSignedIn ? fetchedLinks : [];
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ label: "", href: "" });
  const [savingLink, setSavingLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    // Signing out clears the fetched links by derivation below rather than by setting state here,
    // which would cascade a render.
    if (!auth.isSignedIn) return;

    let active = true;
    fetchMyProfile()
      .then((profile) => {
        if (!active) return;
        if (profile.handle) setMyHandle(profile.handle);
        setFetchedLinks(Array.isArray(profile.headerLinks) ? profile.headerLinks : []);
      })
      .catch(() => {
        // A header that cannot load someone's own links still has to render the app's own.
      });

    return () => {
      active = false;
    };
  }, [auth.isSignedIn]);

  const addLink = async () => {
    const label = draft.label.trim();
    const href = draft.href.trim();
    if (!label || !href) return;

    // Only http(s). A javascript: or data: URL in a link the header renders would run in the page,
    // and this value comes from a text field.
    let parsed: URL;
    try {
      parsed = new URL(href);
    } catch {
      setLinkError(isJapanese ? "URLが正しくありません。" : "That is not a valid URL.");
      return;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      setLinkError(isJapanese ? "http または https のみ使えます。" : "Only http and https links are allowed.");
      return;
    }

    setSavingLink(true);
    setLinkError(null);

    const next = [...links, { label, href: parsed.toString() }];

    try {
      await updateMyProfile({ headerLinks: next });
      setFetchedLinks(next);
      setDraft({ label: "", href: "" });
      setAdding(false);
    } catch (err: unknown) {
      setLinkError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingLink(false);
    }
  };


  // Close menu on click outside
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  const activePath = pathname.replace(/^\/users\/[^/]+/, "") || "/";
  const isHomeActive = activePath === "/" || activePath === "/ja";
  // "photos" is still matched: it remains a route alias, so a shared link keeps highlighting Media.
  const isMediaActive = /^\/(media|photos)/.test(activePath.toLowerCase());
  const isExploreActive = activePath.toLowerCase().startsWith("/explore");
  // The header is part of what Customize arranges, so its own editing affordances live there too
  // rather than following the reader around every page.
  const isCustomizing = activePath.toLowerCase().startsWith("/customize");

  const homeHref = isJapanese ? "/ja" : "/";
  const mediaHref = isJapanese ? "/media/ja" : "/media";
  const exploreHref = isJapanese ? "/explore/ja" : "/explore";

  const title = auth.isSignedIn && auth.user ? auth.user.name || "Hisuiki" : "Hisuiki";
  
  
  return (
    <header className="metro-header">
      <div className="metro-header-row">
        <nav className="metro-pivot" aria-label="Primary">
          <Link href={homeHref} className={`pivot-item ${isHomeActive ? "is-active" : ""}`.trim()}>
            {isJapanese ? "ホーム" : "Home"}
          </Link>
          <Link
            href={exploreHref}
            className={`pivot-item ${isExploreActive ? "is-active" : ""}`.trim()}
          >
            {isJapanese ? "みつける" : "Explore"}
          </Link>
          <Link
            href={mediaHref}
            className={`pivot-item ${isMediaActive ? "is-active" : ""}`.trim()}
          >
            {isJapanese ? "メディア" : "Media"}
          </Link>

          {/* The person's own entries, after the app's. External for now: these become real pages
              once profile pages can be authored, and the shape stored is the same either way. */}
          {links.map((link) => (
            <ExternalLink
              key={`${link.label}:${link.href}`}
              href={link.href}
              label={link.label}
              className="pivot-item pivot-item-external"
            >
              {link.label}
            </ExternalLink>
          ))}

          {isCustomizing && (
            <button
              type="button"
              className="pivot-item pivot-item-add"
              title={isJapanese ? "ヘッダーに追加" : "Add to your header"}
              aria-expanded={adding}
              onClick={() => {
                setAdding(!adding);
                setLinkError(null);
              }}
            >
              +
            </button>
          )}
        </nav>

        {/* The form drops below the strip rather than opening a dialog: it is two fields, and a
            modal for two fields is heavier than the thing it is asking for. */}
        {isCustomizing && adding && (
          <form
            className="header-add-link"
            onSubmit={(e) => {
              e.preventDefault();
              void addLink();
            }}
          >
            <input
              className="editor-commit-input"
              placeholder={isJapanese ? "名前" : "Label"}
              value={draft.label}
              maxLength={40}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            />
            <input
              className="editor-commit-input"
              placeholder="https://"
              value={draft.href}
              onChange={(e) => setDraft({ ...draft, href: e.target.value })}
            />
            <button type="submit" className="editor-btn editor-btn-primary" disabled={savingLink}>
              {savingLink ? (isJapanese ? "追加中…" : "Adding…") : (isJapanese ? "追加" : "Add")}
            </button>
            <button type="button" className="editor-btn editor-btn-cancel" onClick={() => setAdding(false)}>
              {isJapanese ? "キャンセル" : "Cancel"}
            </button>
            {linkError !== null && <p className="header-add-error">{linkError}</p>}
          </form>
        )}

        <div className="metro-avatar-container" style={{ position: "relative" }} ref={menuRef}>
          <button 
            className="metro-avatar-tile" 
            aria-label="User menu" 
            title={title}
            onClick={() => setMenuOpen(!menuOpen)}
            style={{ padding: 0, border: "none", cursor: "pointer", background: "none" }}
          >
            {auth.isSignedIn && auth.user?.image ? (
              <SmartImage
                src={auth.user.image}
                alt={title}
                width="100%"
                height="100%"
                style={{ objectFit: "cover", display: "block" }}
              />
            ) : (
              <HeadlineLogo />
            )}
          </button>
          
          {menuOpen && (
            <div className="metro-dropdown-menu" style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              right: 0,
              background: "var(--color-surface)",
              border: "2px solid var(--color-accent)",
              minWidth: "220px",
              display: "flex",
              flexDirection: "column",
              zIndex: 1000,
              boxShadow: "0 8px 32px var(--color-surface-veil)"
            }}>
              {auth.isSignedIn ? (
                <>
                  <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--color-accent-soft)" }}>
                    <div style={{ fontWeight: 600, color: "var(--color-text)", fontSize: "1.2em", marginBottom: "4px" }}>
                      {auth.user?.name || "User"}
                    </div>
                    <div style={{ color: "var(--color-text-secondary)", fontSize: "0.9em" }}>
                      {auth.user?.email}
                    </div>
                  </div>
                  
                  <a 
                    href={myHandle ? (import.meta.env.DEV ? `/users/${myHandle}` : `https://${myHandle}.hisuiki.com`) : "#"}
                    className="metro-dropdown-item"
                    onClick={(e) => {
                      if (!myHandle) { e.preventDefault(); alert(isJapanese ? "プロフィールを設定してください" : "Please set a handle in Settings first."); }
                      else setMenuOpen(false);
                    }}
                  >
                    {isJapanese ? "プロフィール" : "Profile"}
                  </a>

                  <Link
                    href="/customize"
                    className="metro-dropdown-item"
                    onClick={() => setMenuOpen(false)}
                  >
                    {isJapanese ? "カスタマイズ" : "Customize"}
                  </Link>

                  <Link 
                    href="/settings" 
                    className="metro-dropdown-item"
                    onClick={() => setMenuOpen(false)}
                  >
                    {isJapanese ? "設定" : "Settings"}
                  </Link>
                  <button
                    className="metro-dropdown-item"
                    onClick={() => {
                      setMenuOpen(false);
                      void auth.signOut();
                    }}
                  >
                    {isJapanese ? "サインアウト" : "Sign out"}
                  </button>
                </>
              ) : (
                <a 
                  href={signInHref(isJapanese)} 
                  className="metro-dropdown-item"
                  onClick={() => setMenuOpen(false)}
                >
                  {isJapanese ? "サインイン" : "Sign in"}
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
