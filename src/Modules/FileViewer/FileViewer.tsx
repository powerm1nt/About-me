import React, { useEffect, useState } from "react";
import "./FileViewer.scss";
import { marked } from "marked";
import hljs from "highlight.js";
import "./_hljs.scss";
import "../../Common/Components/Info/Info.scss";

const RAW_REPO_BASE = "https://raw.githubusercontent.com/powerm1nt/About-me/main/";
const GITHUB_REPO_BASE = "https://github.com/powerm1nt/About-me/blob/main/";

const isExternal = (url: string): boolean => {
  return /^(https?:|\/\/|data:|mailto:|#)/i.test(url);
};

const normalizeRelativePath = (baseFile: string, relativePath: string): string => {
  const cleanRel = relativePath.replace(/^\.\//, "");
  if (cleanRel.startsWith("/")) {
    return cleanRel.replace(/^\/+/, "");
  }
  const parts = baseFile.split("/");
  parts.pop(); // remove current filename

  const relParts = cleanRel.split("/");
  for (const part of relParts) {
    if (part === "..") {
      parts.pop();
    } else if (part !== "." && part !== "") {
      parts.push(part);
    }
  }
  return parts.join("/");
};

const resolveAssetUrl = (urlStr: string, currentFile: string): string => {
  if (!urlStr || isExternal(urlStr)) return urlStr;
  const path = normalizeRelativePath(currentFile, urlStr);
  return `${RAW_REPO_BASE}${path}`;
};

const resolveLinkUrl = (urlStr: string, currentFile: string): string => {
  if (!urlStr || isExternal(urlStr)) return urlStr;
  const path = normalizeRelativePath(currentFile, urlStr);
  if (path.endsWith(".md") || path.endsWith(".mdx")) {
    return `?file=${encodeURIComponent(path)}`;
  }
  return `${GITHUB_REPO_BASE}${path}`;
};

const fetchFileContent = async (file: string): Promise<string> => {
  if (import.meta.env.DEV && (file === "README.mdx" || file === "README.md")) {
    try {
      const localRes = await fetch(`/${file}`);
      if (localRes.ok) return await localRes.text();
    } catch {
      // Fallback to remote GitHub
    }
  }

  const primaryUrl = `${RAW_REPO_BASE}${file}`;
  const primaryRes = await fetch(primaryUrl);
  if (primaryRes.ok) {
    return await primaryRes.text();
  }

  if (file.endsWith(".mdx")) {
    const altUrl = `${RAW_REPO_BASE}${file.slice(0, -1)}`;
    const altRes = await fetch(altUrl);
    if (altRes.ok) return await altRes.text();
  } else if (file.endsWith(".md")) {
    const altUrl = `${RAW_REPO_BASE}${file}x`;
    const altRes = await fetch(altUrl);
    if (altRes.ok) return await altRes.text();
  }

  throw new Error(`Failed to load ${file} (HTTP ${primaryRes.status})`);
};

const FileViewer = () => {
  const [filePath, setFilePath] = useState<string>("README.mdx");
  const [htmlContent, setHtmlContent] = useState<string>("");

  useEffect(() => {
    const handleUrlChange = () => {
      const params = new URLSearchParams(window.location.search);
      const requestedFile = params.get("file") || "README.mdx";
      setFilePath(requestedFile);
    };

    handleUrlChange();
    window.addEventListener("popstate", handleUrlChange);
    return () => window.removeEventListener("popstate", handleUrlChange);
  }, []);

  useEffect(() => {
    fetchFileContent(filePath)
      .then(async (rawText) => {
        const customRenderer = new marked.Renderer();

        customRenderer.image = ({ href, title, text }) => {
          const resolvedSrc = resolveAssetUrl(href, filePath);
          return `<img src="${resolvedSrc}" alt="${text || ""}"${title ? ` title="${title}"` : ""} />`;
        };

        customRenderer.link = ({ href, title, text }) => {
          const resolvedHref = resolveLinkUrl(href, filePath);
          const target = resolvedHref.startsWith("?") ? "" : ' target="_blank" rel="noreferrer"';
          return `<a href="${resolvedHref}"${title ? ` title="${title}"` : ""}${target}>${text}</a>`;
        };

        customRenderer.html = ({ text }) => {
          const infoMatch = text.match(/<(Info|info)\s+text=["']([^"']*)["']\s*\/?>/i);
          if (infoMatch) {
            const infoText = infoMatch[2];
            return `
              <div class="cmpns cmpns-info-bubble">
                <div class="info-icon-wrapper" aria-hidden="true">
                  <svg class="info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                  </svg>
                </div>
                <div class="info-body">
                  <div class="info-content">${infoText}</div>
                </div>
              </div>
            `;
          }
          return text;
        };

        const parsed = marked.parse(rawText, { renderer: customRenderer });
        const htmlResult = typeof parsed === "string" ? parsed : await parsed;
        setHtmlContent(htmlResult);
        setTimeout(() => hljs.highlightAll(), 0);
      })
      .catch(() => {
        setHtmlContent(`<h1>Unable to fetch requested page: ${filePath}</h1>`);
      });
  }, [filePath]);

  const handleContentClick = (e: React.MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest("a");
    if (!anchor) return;

    const href = anchor.getAttribute("href");
    if (!href) return;

    if (href.startsWith("?file=")) {
      e.preventDefault();
      const params = new URLSearchParams(href);
      const targetFile = params.get("file");
      if (targetFile) {
        window.history.pushState({}, "", href);
        setFilePath(targetFile);
      }
    } else if (!isExternal(href) && (href.endsWith(".md") || href.endsWith(".mdx"))) {
      e.preventDefault();
      const normalized = normalizeRelativePath(filePath, href);
      const newUrl = `?file=${encodeURIComponent(normalized)}`;
      window.history.pushState({}, "", newUrl);
      setFilePath(normalized);
    }
  };

  return (
    <main className="main-content">
      <div className="main-content-container">
        <div
          className="file-content"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
          onClick={handleContentClick}
        />
      </div>
    </main>
  );
};

export default FileViewer;
