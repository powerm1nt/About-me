import { useEffect, useMemo, useState } from "react";
import Skeleton from "../../Common/Components/Skeleton/Skeleton";
import InfoBubble from "../../Common/Components/InfoBubble/InfoBubble";
import MdContentRenderer from "../../Common/Components/MdContentRenderer/MdContentRenderer";
import PageEditor from "../../Common/Components/PageEditor/PageEditor";
import PageHistory from "../../Common/Components/PageHistory/PageHistory";
import { Link } from "../../Services/router";
import { useAuth } from "../../Services/auth";
import { fetchArticles, fetchPage } from "../../Services/api";
import { articleRoute, blogArticlesFor, isBlogArticlePath, isJapanesePath } from "../../Services/paths";
import type { ArticleMetadata, Page } from "../../Services/types";

export interface FileViewerProps {
  /** Blob path of the page to show, e.g. "blog/welcome.ja.md". */
  filePath: string;
  isJapanese?: boolean;
}

/** The reading pane: one markdown page, its metadata header, and the footer nav. */
export default function FileViewer({ filePath, isJapanese = false }: FileViewerProps) {
  const auth = useAuth();

  const [articles, setArticles] = useState<ArticleMetadata[]>([]);

  // Both are tagged with the path they belong to and matched against the current `filePath`, so
  // navigation resets them by derivation rather than through an effect.
  const [loaded, setLoaded] = useState<{ path: string; page: Page | null; error: string | null }>({
    path: filePath,
    page: null,
    error: null,
  });
  const [pane, setPane] = useState<{ path: string; mode: "read" | "edit" | "history" }>({
    path: filePath,
    mode: "read",
  });

  const { page, error } = loaded.path === filePath ? loaded : { page: null, error: null };
  const mode = pane.path === filePath ? pane.mode : "read";

  const japanese = isJapanese || isJapanesePath(filePath);
  const isBlogPost = isBlogArticlePath(filePath);

  useEffect(() => {
    let active = true;

    fetchArticles()
      .then((all) => {
        if (active) setArticles(all);
      })
      .catch(() => {
        if (active) setArticles([]);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    fetchPage(filePath)
      .then((loadedPage) => {
        if (active) setLoaded({ path: filePath, page: loadedPage, error: null });
      })
      .catch((err: unknown) => {
        if (active) {
          setLoaded({
            path: filePath,
            page: null,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });

    return () => {
      active = false;
    };
  }, [filePath]);

  const { prevArticle, nextArticle } = useMemo(() => {
    const list = blogArticlesFor(articles, japanese);
    const index = list.findIndex((a) => a.filePath === filePath);
    return {
      prevArticle: index > 0 ? list[index - 1]! : null,
      nextArticle: index >= 0 && index < list.length - 1 ? list[index + 1]! : null,
    };
  }, [articles, japanese, filePath]);

  // .file-content's entrance is a mount-time CSS animation, so it only replays on a remount.
  // Keying on the path and the load phase replays it for the skeleton, the content, and each nav.
  const phase = error !== null ? "error" : page === null ? "loading" : "ready";

  const showPane = (next: "read" | "edit" | "history") => setPane({ path: filePath, mode: next });

  const startEditing = () => {
    if (!auth.isSignedIn) {
      auth.redirectToLogin();
      return;
    }
    showPane("edit");
  };

  return (
    <main className="main-content">
      <div className="main-content-container">
        <div className="file-content" data-phase={phase} key={`${filePath}:${phase}`}>
          {error !== null ? (
            <InfoBubble title={`Error: ${error}`} className="md-component-danger" />
          ) : page === null ? (
            <>
              <div className="article-header-meta" aria-hidden="true">
                <div className="article-meta-info">
                  <Skeleton className="skeleton-meta" width="130px" />
                  <Skeleton className="skeleton-meta" width="90px" />
                </div>
                <Skeleton className="skeleton-meta" width="110px" />
              </div>
              <Skeleton className="skeleton-title" width="65%" />
              <Skeleton className="skeleton-title" width="42%" />
              {["100%", "93%", "97%", "78%", "88%", "100%", "60%"].map((w, i) => (
                <Skeleton className="skeleton-line" width={w} key={i} />
              ))}
            </>
          ) : (
            <>
              <div className="article-header-meta">
                <div className="article-meta-info">
                  {page.meta.author && <span className="article-meta-author">By {page.meta.author}</span>}
                  {page.meta.lastEdited && (
                    <span className="article-last-edited-badge" title="Last edited timestamp">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      {page.meta.lastEdited}
                    </span>
                  )}
                </div>

                {mode === "read" && (
                  <div className="editor-toggle-row">
                    {auth.isSignedIn && (
                      <span className="editor-signed-in">
                        Signed in as {auth.user!.name || auth.user!.email}
                        <button type="button" onClick={() => void auth.signOut()}>
                          Sign out
                        </button>
                      </span>
                    )}
                    {/* Read-only, so no auth gate — anyone can browse a page's edit history. */}
                    <button
                      type="button"
                      className="github-edit-btn"
                      title="View edit history"
                      onClick={() => showPane("history")}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      <span>History</span>
                    </button>
                    <button
                      type="button"
                      className="github-edit-btn"
                      title="Edit this page"
                      onClick={startEditing}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
                      </svg>
                      <span>Edit this page</span>
                    </button>
                  </div>
                )}
              </div>

              {mode === "edit" ? (
                <PageEditor filePath={filePath} isJapanese={japanese} onClose={() => showPane("read")} />
              ) : mode === "history" ? (
                <PageHistory filePath={filePath} isJapanese={japanese} onClose={() => showPane("read")} />
              ) : (
                <>
                  {page.meta.description && (
                    <p className="article-header-description">{page.meta.description}</p>
                  )}
                  <MdContentRenderer html={page.renderedHtml} isJapanese={japanese} />
                </>
              )}

              <footer className="article-footer-nav">
                <div className="article-nav-row">
                  <div className="nav-cell nav-cell-prev">
                    {prevArticle && (
                      <Link href={articleRoute(prevArticle.filePath)} className="nav-link prev-link">
                        ← {prevArticle.title}
                      </Link>
                    )}
                  </div>

                  <div className="nav-cell nav-cell-middle">
                    {isBlogPost && (
                      <>
                        <Link href={japanese ? "/blog/ja" : "/blog"} className="breadcrumb-link">
                          Blog Index
                        </Link>
                        <span className="nav-separator">|</span>
                      </>
                    )}
                    {filePath !== "README.md" ? (
                      <Link href={japanese ? "/ja" : "/"} className="breadcrumb-link">
                        Home
                      </Link>
                    ) : (
                      <Link href="/blog" className="breadcrumb-link">
                        Explore Blog →
                      </Link>
                    )}
                  </div>

                  <div className="nav-cell nav-cell-next">
                    {nextArticle && (
                      <Link href={articleRoute(nextArticle.filePath)} className="nav-link next-link">
                        {nextArticle.title} →
                      </Link>
                    )}
                  </div>
                </div>
              </footer>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
