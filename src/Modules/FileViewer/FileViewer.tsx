import React, { useEffect, useState, ComponentType } from "react";
import "./FileViewer.scss";
import { evaluate } from "@mdx-js/mdx";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import hljs from "highlight.js";
import "./_hljs.scss";
import Info from "../../Common/Components/Info/Info";
import BlogIndex, { ArticleItem } from "../../Common/Components/BlogIndex/BlogIndex";
import articlesData from "../../generated/articles-metadata.json";

const RAW_REPO_BASE = "https://raw.githubusercontent.com/powerm1nt/About-me/main/";
const GITHUB_REPO_BASE = "https://github.com/powerm1nt/About-me/blob/main/";

const isExternal = (url: string): boolean => {
  return /^(https?:|\/\/|data:|mailto:|#)/i.test(url);
};

const normalizeRelativePath = (baseFile: string, relativePath: string): string => {
  let cleanRel = relativePath.replace(/^\.\//, "");
  if (cleanRel.startsWith("/public/")) {
    cleanRel = cleanRel.replace(/^\/public\//, "public/");
  } else if (cleanRel.startsWith("/")) {
    cleanRel = cleanRel.replace(/^\/+/, "");
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

  let cleanPath = urlStr.replace(/^\.\//, "");
  if (cleanPath.startsWith("/public/")) cleanPath = cleanPath.slice(8);
  else if (cleanPath.startsWith("public/")) cleanPath = cleanPath.slice(7);
  else if (cleanPath.startsWith("/")) cleanPath = cleanPath.slice(1);

  if (import.meta.env.DEV) {
    return `/${cleanPath}`;
  }

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

const stripMDXImportsAndExports = (text: string): string => {
  // Strip import statements and inline source map comment strings
  return text
    .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]*['"];?/gm, "")
    .replace(/^\s*import\s+['"][^'"]*['"];?/gm, "")
    .replace(/\/\/#\s*sourceMappingURL=.*/g, "");
};

const parseFrontmatter = (text: string): { data: Record<string, string>; content: string } => {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return { data: {}, content: text };
  }

  const rawYaml = match[1] || "";
  const content = text.slice(match[0].length);
  const data: Record<string, string> = {};

  for (const line of rawYaml.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx !== -1) {
      const key = line.slice(0, colonIdx).trim();
      let value = line.slice(colonIdx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      data[key] = value;
    }
  }

  return { data, content };
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

type MDXComponentProps = {
  components?: Record<string, React.ComponentType<unknown>>;
};

type ErrorState = {
  brief: string;
  stack?: string;
};

type PageMeta = {
  title?: string;
  description?: string;
  author?: string;
  lastEdited?: string;
};

const FileViewer: React.FC = () => {
  const [filePath, setFilePath] = useState<string>("README.mdx");
  const [MDXContent, setMDXContent] = useState<ComponentType<MDXComponentProps> | null>(null);
  const [errorState, setErrorState] = useState<ErrorState | null>(null);
  const [meta, setMeta] = useState<PageMeta>({});

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
    let isMounted = true;

    fetchFileContent(filePath)
      .then(async (rawText) => {
        try {
          const { data: frontmatter, content: rawMarkdown } = parseFrontmatter(rawText);
          const gitMeta = (articlesData as Record<string, PageMeta>)[filePath] || {};

          const resolvedMeta: PageMeta = {
            title: frontmatter.title || gitMeta.title || "",
            description: frontmatter.description || gitMeta.description || "",
            author: frontmatter.author || gitMeta.author || "Emi (powerm1nt)",
            lastEdited: frontmatter.lastEdited || gitMeta.lastEdited || "",
          };

          const cleanedText = stripMDXImportsAndExports(rawMarkdown);
          const { default: CompiledComponent } = await evaluate(cleanedText, {
            Fragment,
            jsx,
            jsxs,
            development: false,
            useMDXComponents: () => ({ Info, BlogIndex, TOC: BlogIndex }),
          });

          if (isMounted) {
            setErrorState(null);
            setMeta(resolvedMeta);
            setMDXContent(() => CompiledComponent as ComponentType<MDXComponentProps>);
            setTimeout(() => hljs.highlightAll(), 0);
          }
        } catch (err: unknown) {
          if (isMounted) {
            if (err instanceof Error) {
              setErrorState({ brief: err.message, stack: err.stack });
            } else {
              setErrorState({ brief: String(err) });
            }
          }
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          if (err instanceof Error) {
            setErrorState({ brief: err.message, stack: err.stack });
          } else {
            setErrorState({ brief: String(err) });
          }
        }
      });

    return () => {
      isMounted = false;
    };
  }, [filePath]);

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, targetFile: string) => {
    e.preventDefault();
    const newUrl = `?file=${encodeURIComponent(targetFile)}`;
    window.history.pushState({}, "", newUrl);
    window.dispatchEvent(new Event("popstate"));
    setFilePath(targetFile);
  };

  const mdxComponents = {
    Info,
    BlogIndex,
    TOC: BlogIndex,
    img: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
      const resolvedSrc = props.src ? resolveAssetUrl(props.src, filePath) : "";
      return <img {...props} src={resolvedSrc} />;
    },
    a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
      const resolvedHref = props.href ? resolveLinkUrl(props.href, filePath) : "";
      const isTargetExternal = !resolvedHref.startsWith("?");
      return (
        <a
          {...props}
          href={resolvedHref}
          target={isTargetExternal ? "_blank" : undefined}
          rel={isTargetExternal ? "noreferrer" : undefined}
          onClick={(e) => {
            if (props.onClick) props.onClick(e);
            if (resolvedHref.startsWith("?")) {
              e.preventDefault();
              const params = new URLSearchParams(resolvedHref);
              const targetFile = params.get("file");
              if (targetFile) {
                window.history.pushState({}, "", resolvedHref);
                window.dispatchEvent(new Event("popstate"));
                setFilePath(targetFile);
              }
            }
          }}
        />
      );
    },
  };

  const githubEditUrl = `https://github.com/powerm1nt/About-me/edit/main/${filePath}`;

  const renderArticleFooterNav = () => {
    const isJapanese = filePath.endsWith(".ja.mdx");

    const articlesList = (Object.values(articlesData) as ArticleItem[]).filter(
      (art) =>
        art.filePath.startsWith("blog/") &&
        art.filePath !== "blog/index.mdx" &&
        art.filePath !== "blog/index.ja.mdx" &&
        (isJapanese ? art.filePath.endsWith(".ja.mdx") : !art.filePath.endsWith(".ja.mdx"))
    );

    const currentIndex = articlesList.findIndex((art) => art.filePath === filePath);
    const prevArticle = currentIndex > 0 ? articlesList[currentIndex - 1] : null;
    const nextArticle =
      currentIndex >= 0 && currentIndex < articlesList.length - 1
        ? articlesList[currentIndex + 1]
        : null;

    const isBlogPage = filePath.startsWith("blog/");
    const isBlogIndex = filePath === "blog/index.mdx";

    return (
      <footer className="article-footer-nav">
        <div className="article-nav-row">
          <div className="nav-cell nav-cell-prev">
            {prevArticle && (
              <a
                href={`?file=${encodeURIComponent(prevArticle.filePath)}`}
                className="nav-link prev-link"
                onClick={(e) => handleNavClick(e, prevArticle.filePath)}
              >
                ← {prevArticle.title}
              </a>
            )}
          </div>

          <div className="nav-cell nav-cell-middle">
            {isBlogPage && !isBlogIndex && (
              <>
                <a
                  href="?file=blog/index.mdx"
                  className="breadcrumb-link"
                  onClick={(e) => handleNavClick(e, "blog/index.mdx")}
                >
                  Blog Index
                </a>
                <span className="nav-separator">|</span>
              </>
            )}
            {filePath !== "README.mdx" ? (
              <a
                href="?file=README.mdx"
                className="breadcrumb-link"
                onClick={(e) => handleNavClick(e, "README.mdx")}
              >
                Home
              </a>
            ) : (
              <a
                href="?file=blog/index.mdx"
                className="breadcrumb-link"
                onClick={(e) => handleNavClick(e, "blog/index.mdx")}
              >
                Explore Blog →
              </a>
            )}
          </div>

          <div className="nav-cell nav-cell-next">
            {nextArticle && (
              <a
                href={`?file=${encodeURIComponent(nextArticle.filePath)}`}
                className="nav-link next-link"
                onClick={(e) => handleNavClick(e, nextArticle.filePath)}
              >
                {nextArticle.title} →
              </a>
            )}
          </div>
        </div>
      </footer>
    );
  };

  return (
    <main className="main-content">
      <div className="main-content-container">
        <div className="file-content">
          {errorState ? (
            <Info title={`Error: ${errorState.brief}`}>
              {errorState.stack && errorState.stack}
            </Info>
          ) : MDXContent ? (
            <>
              <div className="article-header-meta">
                <div className="article-meta-info">
                  {meta.author && <span className="article-meta-author">By {meta.author}</span>}
                  {meta.lastEdited && (
                    <span className="article-last-edited-badge" title="Last edited timestamp based on git history">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      {meta.lastEdited}
                    </span>
                  )}
                </div>
                <a
                  href={githubEditUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="github-edit-btn"
                  title="Edit this page on GitHub"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                  <span>Edit on GitHub</span>
                </a>
              </div>
              {meta.description && <p className="article-header-description">{meta.description}</p>}
              <MDXContent components={mdxComponents as Record<string, React.ComponentType<unknown>>} />
              {renderArticleFooterNav()}
            </>
          ) : (
            <p>Loading...</p>
          )}
        </div>
      </div>
    </main>
  );
};

export default FileViewer;
