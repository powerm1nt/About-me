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

  const navigateTo = (e: React.MouseEvent<HTMLAnchorElement>, targetFile: string) => {
    e.preventDefault();
    const newUrl = `?file=${encodeURIComponent(targetFile)}`;
    window.history.pushState({}, "", newUrl);
    window.dispatchEvent(new Event("popstate"));
    setCurrentFile(targetFile);
  };

  const isHomeActive = currentFile === "README.mdx" || currentFile === "README.md";
  const isBlogActive = currentFile.startsWith("blog/");

  return (
    <header className="main-header">
      <div className="header-left">
        <a
          href="?file=README.mdx"
          onClick={(e) => navigateTo(e, "README.mdx")}
          className="logo-link"
        >
          <HeadlineLogo />
        </a>
      </div>

      <nav className="header-nav">
        <a
          href="?file=README.mdx"
          onClick={(e) => navigateTo(e, "README.mdx")}
          className={`nav-item ${isHomeActive ? "is-active" : ""}`}
        >
          Home
        </a>
        <a
          href="?file=blog/index.mdx"
          onClick={(e) => navigateTo(e, "blog/index.mdx")}
          className={`nav-item ${isBlogActive ? "is-active" : ""}`}
        >
          Blog
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
      </nav>
    </header>
  );
};

export default Header;
