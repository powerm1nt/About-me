import React, { useEffect, useState } from "react";
import "./FileViewer.scss";
import { compile } from "@mdx-js/mdx";
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

const preprocessInfoTags = (rawText: string): string => {
  // Convert any <Info ... /> or <info ...> tags into a clean standard HTML div placeholder
  // BEFORE marked.parse runs, preventing marked from treating unclosed tags as raw HTML blocks that consume the rest of the document!
  return rawText.replace(/<(Info|info|info-bubble)\s+([^>]*?)(\/>|>(.*?)<\/(Info|info|info-bubble)>)/gi, (_match, _tag, attrs, _end, content) => {
    const textMatch = attrs.match(/text=["']([^"']*)["']/i);
    const titleMatch = attrs.match(/title=["']([^"']*)["']/i);
    const text = textMatch ? textMatch[1] : (content || "");
    const title = titleMatch ? titleMatch[1] : "";
    return `\n\n<div class="cmpns-info-placeholder" data-text="${encodeURIComponent(text)}" data-title="${encodeURIComponent(title)}"></div>\n\n`;
  });
};

const processDOMContent = (container: HTMLElement, currentFile: string) => {
  // Process custom <Info> / <info> elements into HIG Confluence-style Info bubbles
  container.querySelectorAll(".cmpns-info-placeholder, info, Info, info-bubble").forEach((el) => {
    const rawText = el.getAttribute("data-text");
    const textAttr = rawText ? decodeURIComponent(rawText) : (el.getAttribute("text") || el.getAttribute("content") || el.textContent || "");
    const rawTitle = el.getAttribute("data-title");
    const titleAttr = rawTitle ? decodeURIComponent(rawTitle) : (el.getAttribute("title") || "");

    const bubble = document.createElement("div");
    bubble.className = "cmpns cmpns-info-bubble";
    bubble.style.cssText = "display: flex !important; width: 100% !important; box-sizing: border-box !important; margin: 1.2em 0 !important; padding: 1em !important; border: 1px solid #ffffff !important; border-left: 4px solid #ffffff !important; border-radius: 8px !important; background-color: rgba(30, 58, 138, 0.35) !important; color: #ffffff !important; align-items: center !important; gap: 1em !important;";
    bubble.innerHTML = `
      <div class="info-icon-wrapper" style="display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 24px; height: 24px; color: #ffffff;" aria-hidden="true">
        <svg class="info-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 20px; height: 20px; min-width: 20px; min-height: 20px; display: block;">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
      </div>
      <div class="info-body" style="display: flex; flex-direction: column; justify-content: center; flex: 1; color: #ffffff;">
        ${titleAttr ? `<div class="info-title" style="font-weight: 700; color: #ffffff; font-size: 0.95rem; margin-bottom: 0.2em;">${titleAttr}</div>` : ""}
        <div class="info-content" style="font-weight: 400; color: #ffffff; line-height: 1.5;">${textAttr}</div>
      </div>
    `;
    el.replaceWith(bubble);
  });

  // Resolve image sources to remote GitHub raw repository
  container.querySelectorAll("img").forEach((img) => {
    const rawSrc = img.getAttribute("src");
    if (rawSrc && !isExternal(rawSrc)) {
      img.src = resolveAssetUrl(rawSrc, currentFile);
    }
  });

  // Resolve link targets to relative mdx/md files or GitHub repository files
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

const parseMDXOrMarkdown = async (rawText: string): Promise<string> => {
  const preprocessed = preprocessInfoTags(rawText);
  try {
    await compile(preprocessed, { jsx: true });
  } catch {
    // Fallback if MDX compilation encounters strict JSX syntax variations
  }
  const parsed = marked.parse(preprocessed);
  return typeof parsed === "string" ? parsed : await parsed;
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

  // Fallback between .mdx and .md extensions if necessary
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
        const fileContentEl = document.querySelector<HTMLElement>(".file-content");
        if (!fileContentEl) return;

        const html = await parseMDXOrMarkdown(rawText);
        fileContentEl.innerHTML = html;
        processDOMContent(fileContentEl, filePath);
        hljs.highlightAll();
      })
      .catch(() => {
        const fileContentEl = document.querySelector<HTMLElement>(".file-content");
        if (fileContentEl) {
          fileContentEl.innerHTML = `<h1>Unable to fetch requested page: ${filePath}</h1>`;
        }
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
        <div className="file-content" onClick={handleContentClick} />
      </div>
    </main>
  );
};

export default FileViewer;
