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
  // "photos" is still matched: it remains a route alias, so a shared link keeps highlighting Media.
  const isMediaActive = /^\/(media|photos)/.test(activePath.toLowerCase());
  const isExploreActive = activePath.toLowerCase().startsWith("/explore");

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
