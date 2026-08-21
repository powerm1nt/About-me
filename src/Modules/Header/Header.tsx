import HeadlineLogo from "../../Common/Components/HeadlineLogo/HeadlineLogo";
import ExternalLink from "../../Common/Components/ExternalLink/ExternalLink";
import { Link, useRouter } from "../../Services/router";

export interface HeaderProps {
  /** Whether the page currently shown is the Japanese edition; drives the nav labels and links. */
  isJapanese: boolean;
}

/** A horizontally-scrollable row of section labels, with the avatar tiled at the right end. */
export default function Header({ isJapanese }: HeaderProps) {
  const { pathname } = useRouter();

  const isHomeActive = pathname === "/" || pathname === "/ja";
  const isBlogActive = pathname.toLowerCase().startsWith("/blog");
  const isPhotosActive = pathname.toLowerCase().startsWith("/photos");

  const homeHref = isJapanese ? "/ja" : "/";
  const blogHref = isJapanese ? "/blog/ja" : "/blog";
  const photosHref = isJapanese ? "/photos/ja" : "/photos";

  return (
    <header className="metro-header">
      <div className="metro-header-row">
        <nav className="metro-pivot" aria-label="Primary">
          <Link href={homeHref} className={`pivot-item ${isHomeActive ? "is-active" : ""}`.trim()}>
            {isJapanese ? "ホーム" : "Home"}
          </Link>
          <Link href={blogHref} className={`pivot-item ${isBlogActive ? "is-active" : ""}`.trim()}>
            {isJapanese ? "ブログ" : "Blog"}
          </Link>
          <Link
            href={photosHref}
            className={`pivot-item ${isPhotosActive ? "is-active" : ""}`.trim()}
          >
            {isJapanese ? "フォト" : "Photos"}
          </Link>
          <ExternalLink
            href="https://github.com/powerm1nt"
            label="GitHub"
            className="pivot-item pivot-item-external"
          >
            GitHub
          </ExternalLink>
          <ExternalLink
            href="https://www.linkedin.com/in/lchab1440/"
            label="LinkedIn"
            className="pivot-item pivot-item-external"
          >
            LinkedIn
          </ExternalLink>
        </nav>

        <Link href={homeHref} className="metro-avatar-tile" aria-label="Home" title="Emi">
          <HeadlineLogo />
        </Link>
      </div>
    </header>
  );
}
