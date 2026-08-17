/**
 * Blob file paths ("blog/welcome.ja.md") and site routes ("/blog/welcome/ja") are two views of
 * the same article. Everything that converts between them lives here so the header, the blog
 * index, the article footer nav and the router can't drift apart on the rules.
 */

export const JA_SUFFIX = ".ja.md";

export const isJapanesePath = (filePath: string): boolean => filePath.endsWith(JA_SUFFIX);

export const isBlogIndexPath = (filePath: string): boolean =>
  filePath === "blog/index.md" || filePath === "blog/index.ja.md";

export const isBlogArticlePath = (filePath: string): boolean =>
  filePath.startsWith("blog/") && !isBlogIndexPath(filePath);

/** "blog/welcome.ja.md" → "/blog/welcome/ja"; "blog/welcome.md" → "/blog/welcome". */
export function articleRoute(filePath: string): string {
  const ja = isJapanesePath(filePath);
  const withoutDir = filePath.startsWith("blog/") ? filePath.slice("blog/".length) : filePath;
  const slug = ja ? withoutDir.slice(0, -JA_SUFFIX.length) : withoutDir.replace(/\.md$/, "");
  return ja ? `/blog/${slug}/ja` : `/blog/${slug}`;
}

/** The list of blog articles for one language, in the order the prev/next nav walks them. */
export function blogArticlesFor<T extends { filePath: string }>(
  articles: T[],
  japanese: boolean
): T[] {
  return articles.filter(
    (a) => isBlogArticlePath(a.filePath) && isJapanesePath(a.filePath) === japanese
  );
}
