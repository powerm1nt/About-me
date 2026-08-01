import articlesData from "../../../generated/articles-metadata.json";
import "./BlogIndex.scss";

export interface ArticleItem {
  filePath: string;
  title: string;
  description: string;
  author: string;
  lastEdited: string;
  created?: string;
}

export default function BlogIndex() {
  const articles = (Object.values(articlesData) as ArticleItem[]).filter(
    (item) => item.filePath.startsWith("blog/") && item.filePath !== "blog/index.mdx"
  );

  return (
    <div className="blog-index-container">
      <h2>Articles</h2>
      <div className="blog-index-list">
        {articles.map((art) => (
          <article key={art.filePath} className="blog-index-card">
            <h3 className="blog-card-title">
              <a href={`?file=${encodeURIComponent(art.filePath)}`}>{art.title}</a>
            </h3>
            {art.description && <p className="blog-card-desc">{art.description}</p>}
            <div className="blog-card-meta">
              <span className="blog-card-author">By {art.author}</span>
              <span className="blog-card-last-edited" title={`Created: ${art.created || art.lastEdited}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                {art.lastEdited}
              </span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
