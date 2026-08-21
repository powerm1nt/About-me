import { useState, useRef, useEffect } from "react";
import HeadlineLogo from "../../Common/Components/HeadlineLogo/HeadlineLogo";
import SmartImage from "../../Common/Components/SmartImage/SmartImage";
import { Link, useRouter } from "../../Services/router";
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

  useEffect(() => {
    if (auth.isSignedIn && !myHandle) {
      fetch('/api/profile/me', { credentials: 'include' }).then(res => res.ok ? res.json() : null).then(data => {
        if (data && data.handle) setMyHandle(data.handle);
      }).catch(() => {});
    }
  }, [auth.isSignedIn, myHandle]);


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
  const isPostsActive = activePath.toLowerCase().startsWith("/posts");
  const isPhotosActive = activePath.toLowerCase().startsWith("/photos");
  const isSettingsActive = activePath.toLowerCase().startsWith("/settings");

  const homeHref = isJapanese ? "/ja" : "/";
  const postsHref = isJapanese ? "/posts/ja" : "/posts";
  const photosHref = isJapanese ? "/photos/ja" : "/photos";

  const title = auth.isSignedIn && auth.user ? auth.user.name || "Hisuiki" : "Hisuiki";
  
  
  return (
    <header className="metro-header">
      <div className="metro-header-row">
        <nav className="metro-pivot" aria-label="Primary">
          <Link href={homeHref} className={`pivot-item ${isHomeActive ? "is-active" : ""}`.trim()}>
            {isJapanese ? "ホーム" : "Home"}
          </Link>
          <Link href={postsHref} className={`pivot-item ${isPostsActive ? "is-active" : ""}`.trim()}>
            {isJapanese ? "投稿" : "Posts"}
          </Link>
          <Link
            href={photosHref}
            className={`pivot-item ${isPhotosActive ? "is-active" : ""}`.trim()}
          >
            {isJapanese ? "フォト" : "Photos"}
          </Link>

          {auth.isSignedIn && (
            <>
              <a 
                href={myHandle ? (import.meta.env.DEV ? `/users/${myHandle}` : `https://${myHandle}.hisuiki.com`) : "#"}
                className="pivot-item"
                onClick={(e) => {
                  if (!myHandle) { e.preventDefault(); alert(isJapanese ? "プロフィールを設定してください" : "Please set a handle in Settings first."); }
                }}
              >
                {isJapanese ? "プロフィール" : "Profile"}
              </a>
              <Link
                href="/settings"
                className={`pivot-item ${isSettingsActive ? "is-active" : ""}`.trim()}
              >
                {isJapanese ? "設定" : "Settings"}
              </Link>
            </>
          )}

        </nav>

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
