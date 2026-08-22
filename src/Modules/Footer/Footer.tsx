import { useEffect, useState } from "react";
import ExternalLink from "../../Common/Components/ExternalLink/ExternalLink";
import SmartImage from "../../Common/Components/SmartImage/SmartImage";
import { assetUrl } from "../../Services/config";

interface VersionInfo {
  version: string;
  build: number;
}

// Used if version.json is missing or malformed.
const FALLBACK_VERSION = "2.1";

export default function Footer() {
  const [version, setVersion] = useState(FALLBACK_VERSION);

  // The deploy workflow bumps version.json's "build" on every push to main, so this tracks the
  // deployed build rather than a hand-edited constant.
  useEffect(() => {
    let active = true;

    fetch("/version.json")
      .then((r) => (r.ok ? (r.json() as Promise<VersionInfo>) : null))
      .then((info) => {
        if (active && info) setVersion(`${info.version}.${info.build}`);
      })
      .catch(() => {
        // Keep the static fallback.
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <footer className="main-footer">
      <div className="footer-container">
        <div className="footer-left">
          <ExternalLink href="https://nuka.works/" label="NukaWorks" className="sunproj-logo">
            <SmartImage
              src={assetUrl("logo_nwrks.png")}
              alt="NukaWorks Logo"
              width="40px"
              height="40px"
              style={{ borderRadius: "50%" }}
            />
            <p>
              <span className="logo-bold">Nuka</span>
              <span className="logo-light">Works</span>
            </p>
          </ExternalLink>

          {/* What Hisuiki is, kept here rather than as a tab: it is the sort of thing a visitor
              reads once, and a tab beside the feed spent prime space on it every visit. */}
          <div className="footer-about">
            <p className="footer-about-lead">
              Hisuiki is a media sharing and blogging platform. Post photos, write articles, and
              comment on what other people share.
            </p>
            <p className="footer-about-detail">
              Every account gets its own space at <code>{"{handle}"}.hisuiki.com</code>, with its own
              pages and its own look. Writing is stored as markdown files you can fetch and keep, and
              every edit is versioned.
            </p>
          </div>

          <div className="projAbout">
            <p>© {new Date().getUTCFullYear()} NukaWorks Solutions - All rights reserved.</p>
            <ExternalLink
              href="https://github.com/powerm1nt/Hisuiki"
              label="Hisuiki on GitHub"
              className="buildinfo"
            >
              hisuiki<span>@</span>
              {version}
            </ExternalLink>
          </div>
        </div>
      </div>
    </footer>
  );
}
