import React, { useEffect, useState } from "react";
import "./Header.scss";
import HeadlineLogo from "../../Common/Components/HeadlineLogo/HeadlineLogo";

const Header: React.FC = () => {
  const [currentFile, setCurrentFile] = useState<string>("README.mdx");

  useEffect(() => {
    const handleUrlChange = () => {
      const params = new URLSearchParams(window.location.search);
      const file = params.get("file") || "README.mdx";
      setCurrentFile(file);
    };

    handleUrlChange();
    window.addEventListener("popstate", handleUrlChange);
    return () => window.removeEventListener("popstate", handleUrlChange);
  }, []);

  const navigateTo = (targetFile: string, e?: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    if (e) e.preventDefault();
    const newUrl = `?file=${encodeURIComponent(targetFile)}`;
    window.history.pushState({}, "", newUrl);
    window.dispatchEvent(new Event("popstate"));
    setCurrentFile(targetFile);
  };

  const isHomeActive = currentFile === "README.mdx" || currentFile === "README.md" || currentFile === "README.ja.mdx";
  const isBlogActive = currentFile.startsWith("blog/");
  const isJapanese = currentFile.endsWith(".ja.mdx");

  const switchLanguage = (lang: "EN" | "JA") => {
    if (lang === "JA" && !isJapanese) {
      let newFile = currentFile.replace(/\.mdx$/, ".ja.mdx");
      if (newFile === currentFile) newFile = currentFile.replace(/\.md$/, ".ja.mdx");
      navigateTo(newFile);
    } else if (lang === "EN" && isJapanese) {
      const newFile = currentFile.replace(/\.ja\.mdx$/, ".mdx");
      navigateTo(newFile);
    }
  };

  return (
    <header className="main-header">
      <div className="header-container">
        <div className="header-left">
          <a
            href={`?file=${isJapanese ? "README.ja.mdx" : "README.mdx"}`}
            onClick={(e) => navigateTo(isJapanese ? "README.ja.mdx" : "README.mdx", e)}
            className="logo-link"
          >
            <HeadlineLogo />
          </a>
        </div>

        <nav className="header-nav">
          <a
            href={`?file=${isJapanese ? "README.ja.mdx" : "README.mdx"}`}
            onClick={(e) => navigateTo(isJapanese ? "README.ja.mdx" : "README.mdx", e)}
            className={`nav-item ${isHomeActive ? "is-active" : ""}`}
          >
            {isJapanese ? "ホーム" : "Home"}
          </a>
          <a
            href={`?file=blog/index${isJapanese ? ".ja" : ""}.mdx`}
            onClick={(e) => navigateTo(`blog/index${isJapanese ? ".ja" : ""}.mdx`, e)}
            className={`nav-item ${isBlogActive ? "is-active" : ""}`}
          >
            {isJapanese ? "ブログ" : "Blog"}
          </a>
          <a
            href="https://github.com/powerm1nt"
            target="_blank"
            rel="noreferrer"
            className="nav-item external-link"
          >
            GitHub ↗
          </a>
          <a
            href="https://www.linkedin.com/in/lchab1440/"
            target="_blank"
            rel="noreferrer"
            className="nav-item external-link"
          >
            LinkedIn ↗
          </a>

          <div className="language-selector" style={{ display: "flex", gap: "0.5rem", marginLeft: "1rem" }}>
            <button
              onClick={() => switchLanguage("EN")}
              style={{ fontWeight: !isJapanese ? "bold" : "normal", cursor: "pointer", background: "none", border: "none", color: "inherit" }}
            >
              EN
            </button>
            <span>|</span>
            <button
              onClick={() => switchLanguage("JA")}
              style={{ fontWeight: isJapanese ? "bold" : "normal", cursor: "pointer", background: "none", border: "none", color: "inherit" }}
            >
              JA
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
};

export default Header;
