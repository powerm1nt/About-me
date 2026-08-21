import { useEffect, useMemo, useState } from "react";
import Skeleton from "../Skeleton/Skeleton";
import PageEditor from "../PageEditor/PageEditor";
import { Link } from "../../../Services/router";
import { useAuth } from "../../../Services/auth";
import { fetchArticles } from "../../../Services/api";
import { articleRoute, blogArticlesFor } from "../../../Services/paths";
import type { ArticleMetadata } from "../../../Services/types";

export interface BlogIndexProps {
  isJapanese?: boolean;
}

/** The article list rendered in place of a `<BlogIndex />` tag, plus the "Add new article" entry. */
export default function BlogIndex({ isJapanese = false }: BlogIndexProps) {
  const auth = useAuth();

  const [allArticles, setAllArticles] = useState<ArticleMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    let active = true;

    fetchArticles()
      .then((articles) => {
        if (active) setAllArticles(articles);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const articles = useMemo(
    () => blogArticlesFor(allArticles, isJapanese),
    [allArticles, isJapanese]
  );

  const startCreating = () => {
    if (!auth.isSignedIn) {
      auth.redirectToLogin();
      return;
    }
    setIsCreating(true);
  };

  return (
    <div className="blog-index-container">
      <div className="blog-index-header">
        <h2>Articles</h2>
        {!isCreating && (
          <button type="button" className="editor-btn editor-btn-primary" onClick={startCreating}>
            + Add new article
          </button>
        )}
      </div>

      {isCreating ? (
        <PageEditor isNewFile isJapanese={isJapanese} onClose={() => setIsCreating(false)} />
      ) : loading ? (
        <div className="blog-index-list" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div className="blog-index-card" key={i}>
              <Skeleton className="skeleton-title" width="55%" />
              <Skeleton className="skeleton-line" width="80%" />
              <Skeleton className="skeleton-meta" width="100px" />
            </div>
          ))}
        </div>
      ) : error ? (
        <p className="loading-text" style={{ color: "red" }}>
          Error loading articles: {error}
        </p>
      ) : articles.length === 0 ? (
        <p className="loading-text">No articles found.</p>
      ) : (
        <div className="blog-index-list">
          {articles.map((art) => (
            <article className="blog-index-card" key={art.filePath}>
              <h3 className="blog-card-title">
                <Link href={articleRoute(art.filePath)}>{art.title}</Link>
              </h3>
              {art.description && <p className="blog-card-desc">{art.description}</p>}
              <div className="blog-card-meta">
                {art.author && <span className="blog-card-author">By {art.author}</span>}
                {art.lastEdited && (
                  <span
                    className="blog-card-last-edited"
                    title={`Created: ${art.created || art.lastEdited}`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    {art.lastEdited}
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
