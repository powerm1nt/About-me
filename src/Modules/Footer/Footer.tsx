import { useEffect, useState } from "react";
import ExternalLink from "../../Common/Components/ExternalLink/ExternalLink";
import SmartImage from "../../Common/Components/SmartImage/SmartImage";
import { assetUrl } from "../../Services/config";

interface VersionInfo {
  version: string;
  build: number;
}

// Fallback shown if version.json is missing or malformed; the real value is fetched below.
const FALLBACK_VERSION = "2.1";

export default function Footer() {
  const [version, setVersion] = useState(FALLBACK_VERSION);

  // public/version.json's "build" is bumped automatically by the deploy workflow on every push to
  // main, so this always reflects the actual deployed build rather than a value that has to be
  // remembered and hand-edited on every release.
  useEffect(() => {
    let active = true;

    fetch("/version.json")
      .then((r) => (r.ok ? (r.json() as Promise<VersionInfo>) : null))
      .then((info) => {
        if (active && info) setVersion(`${info.version}.${info.build}`);
      })
      .catch(() => {
        // Keep the static fallback (404, offline, malformed file, ...).
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

          <div className="projAbout">
            <p>© {new Date().getUTCFullYear()} NukaWorks Solutions - All rights reserved.</p>
            <ExternalLink
              href="https://github.com/powerm1nt/About-me"
              label="About Me on GitHub"
              className="buildinfo"
            >
              about-me<span>@</span>
              {version}
            </ExternalLink>
          </div>
        </div>
      </div>
    </footer>
  );
}
