import { useEffect, useState } from "react";
import "./FileViewer.scss";
import { marked } from "marked";
import hljs from "highlight.js";
import "./_hljs.scss";

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
  parts.pop(); // remove filename
  const baseDir = parts.join("/");
  return baseDir ? `${baseDir}/${cleanRel}` : cleanRel;
};

const resolveAssetUrl = (urlStr: string, currentFile: string): string => {
  if (!urlStr || isExternal(urlStr)) return urlStr;
  const path = normalizeRelativePath(currentFile, urlStr);
  return `${RAW_REPO_BASE}${path}`;
};

const resolveLinkUrl = (urlStr: string, currentFile: string): string => {
  if (!urlStr || isExternal(urlStr)) return urlStr;
  const path = normalizeRelativePath(currentFile, urlStr);
  if (path.endsWith(".md")) {
    return `?file=${encodeURIComponent(path)}`;
  }
  return `${GITHUB_REPO_BASE}${path}`;
};

const processDOMContent = (container: HTMLElement, currentFile: string) => {
  // Resolve image sources to remote GitHub raw repository
  container.querySelectorAll("img").forEach((img) => {
    const rawSrc = img.getAttribute("src");
    if (rawSrc && !isExternal(rawSrc)) {
      img.src = resolveAssetUrl(rawSrc, currentFile);
    }
  });

  // Resolve link targets to relative markdown files or GitHub repository files
  container.querySelectorAll("a").forEach((a) => {
    const rawHref = a.getAttribute("href");
    if (rawHref && !isExternal(rawHref)) {
      const resolved = resolveLinkUrl(rawHref, currentFile);
      a.setAttribute("href", resolved);
      if (!resolved.startsWith("?")) {
        a.target = "_blank";
        a.rel = "noreferrer";
      }
    }
  });
};

const fileFetcher = async (url: string): Promise<string> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.text();
};

const FileViewer = () => {
  const [filePath, setFilePath] = useState<string>("README.md");

  useEffect(() => {
    const handleUrlChange = () => {
      const params = new URLSearchParams(window.location.search);
      const requestedFile = params.get("file") || "README.md";
      setFilePath(requestedFile);
    };

    handleUrlChange();
    window.addEventListener("popstate", handleUrlChange);
    return () => window.removeEventListener("popstate", handleUrlChange);
  }, []);

  useEffect(() => {
    const targetUrl =
      import.meta.env.DEV && filePath === "README.md"
        ? "/README.md"
        : `${RAW_REPO_BASE}${filePath}`;

    fileFetcher(targetUrl)
      .then((markdownText) => {
        const fileContentEl = document.querySelector<HTMLElement>(".file-content");
        if (!fileContentEl) return;

        const renderHtml = (html: string) => {
          fileContentEl.innerHTML = html;
          processDOMContent(fileContentEl, filePath);
          hljs.highlightAll();
        };

        const parsed = marked.parse(markdownText);
        if (typeof parsed === "string") {
          renderHtml(parsed);
        } else {
          parsed.then(renderHtml);
        }
      })
      .catch(() => {
        const fileContentEl = document.querySelector<HTMLElement>(".file-content");
        if (fileContentEl) {
          fileContentEl.innerHTML = "<h1>Unable to fetch the requested file :/</h1>";
        }
      });
  }, [filePath]);

  return (
    <main className="main-content">
      <div className="main-content-container">
        <div className="file-content" />
      </div>
    </main>
  );
};

export default FileViewer;
