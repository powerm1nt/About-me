import { useCallback, useEffect, useState } from "react";
import PostComposer from "../../Common/Components/PostComposer/PostComposer";
import Skeleton from "../../Common/Components/Skeleton/Skeleton";
import SmartImage from "../../Common/Components/SmartImage/SmartImage";
import InfoBubble from "../../Common/Components/InfoBubble/InfoBubble";
import { fetchFeed } from "../../Services/api";
import { assetUrl } from "../../Services/config";
import type { PostSummary } from "../../Services/types";

export interface LandingProps {
  isJapanese: boolean;
  tab: "home" | "explore" | "about";
}

const TEXT = {
  en: {
    forYou: "For You",
    empty: "Nothing here yet.",
    exploreLead: "Everything being posted, newest first — no ranking, no algorithm.",
    error: "Could not load posts: ",
    aboutTitle: "What Hisuiki is",
    aboutLead:
      "Hisuiki is a media sharing and blogging platform. Post photos, write articles, and comment on what other people share.",
    aboutProfile: "Every account gets its own space at {handle}.hisuiki.com — its own pages, its own wallpaper, its own stylesheet.",
    aboutOwnership: "Your writing is stored as plain markdown files you can fetch and keep, and every edit is kept as a version.",
    signedOutHint: "Sign in to post, comment, and make the place yours.",
  },
  ja: {
    forYou: "おすすめ",
    empty: "まだ何もありません。",
    exploreLead: "投稿されたすべて。新しい順、並べ替えなし。",
    error: "投稿を読み込めませんでした: ",
    aboutTitle: "Hisuikiとは",
    aboutLead: "Hisuikiはメディア共有とブログのプラットフォームです。写真を投稿し、記事を書き、他の人の投稿にコメントできます。",
    aboutProfile: "アカウントごとに {handle}.hisuiki.com の専用スペースがあります。ページも壁紙もスタイルも自分のものです。",
    aboutOwnership: "書いたものはマークダウンのファイルとして保存され、編集のたびにバージョンが残ります。",
    signedOutHint: "サインインすると、投稿・コメント・カスタマイズができます。",
  },
} as const;

/** A relative time, because a feed is read in terms of "how long ago", not calendar dates. */
function timeAgo(iso: string, japanese: boolean): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  const units: [number, string, string][] = [
    [60, "s", "秒"],
    [3600, "m", "分"],
    [86400, "h", "時間"],
    [604800, "d", "日"],
  ];

  for (const [limit, short, ja] of units) {
    if (seconds < limit) {
      const divisor = limit === 60 ? 1 : limit / 60;
      return `${Math.floor(seconds / divisor)}${japanese ? ja : short}`;
    }
  }
  return new Intl.DateTimeFormat(japanese ? "ja-JP" : "en-US", { month: "short", day: "numeric" })
    .format(new Date(iso));
}

/**
 * The signed-out and signed-in landing surface.
 *
 * "home" is the feed with the composer on top. "explore" is the same content without whatever
 * ranking home applies — deliberately the plain reverse-chronological view, so there is always a way
 * to see what is actually being posted rather than what an algorithm chose. "about" explains the
 * site to someone who has just arrived.
 */
export default function Landing({ isJapanese, tab }: LandingProps) {
  const text = isJapanese ? TEXT.ja : TEXT.en;

  // Tagged with the tab it was loaded for, so switching tabs resets the feed by derivation rather
  // than through an effect that sets state synchronously and cascades a render.
  const [loaded, setLoaded] = useState<{
    tab: string;
    posts: PostSummary[] | null;
    error: string | null;
  }>({ tab, posts: null, error: null });

  const { posts, error } = loaded.tab === tab ? loaded : { posts: null, error: null };
  const loading = posts === null && error === null;

  const showsFeed = tab !== "about";

  useEffect(() => {
    if (!showsFeed) return;

    let active = true;

    fetchFeed(tab === "explore" ? { sort: "recent" } : {})
      .then((next) => {
        if (active) setLoaded({ tab, posts: next, error: null });
      })
      .catch((err: unknown) => {
        if (active) {
          setLoaded({ tab, posts: null, error: err instanceof Error ? err.message : String(err) });
        }
      });

    return () => {
      active = false;
    };
  }, [showsFeed, tab]);

  // Prepended rather than refetched: the post is already in hand, and a refetch can race the write.
  const onPosted = useCallback((post: PostSummary) => {
    setLoaded((current) => ({ ...current, posts: [post, ...(current.posts ?? [])] }));
  }, []);

  return (
    <div className="file-content landing" data-phase="ready">
      {/* Explore is the same feed with ranking off, reached from the header rather than a tab bar
          here — one surface, two orderings, no second list of the same posts. */}
      {tab === "home" ? (
        <PostComposer isJapanese={isJapanese} onPosted={onPosted} />
      ) : (
        <p className="landing-lead">{text.exploreLead}</p>
      )}

      {error !== null ? (
        <InfoBubble title={`${text.error}${error}`} className="md-component-danger" />
      ) : loading ? (
        <div className="feed" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <article className="feed-post" key={i}>
              <Skeleton className="skeleton-meta" width="140px" />
              <Skeleton className="skeleton-line" width="95%" />
              <Skeleton className="skeleton-line" width="70%" />
            </article>
          ))}
        </div>
      ) : (posts ?? []).length === 0 ? (
        <p className="loading-text">{text.empty}</p>
      ) : (
        <div className="feed">
          {(posts ?? []).map((post) => {
            const handle = post.author.profile?.handle;
            return (
              <article className="feed-post" key={post.id} data-post={post.id}>
                <header className="feed-post-head">
                  {post.author.image && (
                    <img className="feed-avatar" src={post.author.image} alt="" width={40} height={40} />
                  )}
                  <span className="feed-author">{post.author.name || handle || "Someone"}</span>
                  {handle && <span className="feed-handle">@{handle}</span>}
                  <span className="feed-time">{timeAgo(post.createdAt, isJapanese)}</span>
                </header>

                {post.title && <h3 className="feed-title">{post.title}</h3>}

                {/* The first image only: a card is a preview, and the post's page has the rest. */}
                {post.media[0] && (
                  <SmartImage
                    src={assetUrl(post.media[0].thumbPath ?? post.media[0].path)}
                    alt={post.media[0].alt}
                    block
                  />
                )}

                {/* Server-sanitised: renderUserContent strips anything outside its allow-list and
                    scopes the post's own stylesheet to this data-post container. */}
                <div className="feed-body" dangerouslySetInnerHTML={{ __html: post.renderedHtml ?? "" }} />

                <footer className="feed-post-foot">
                  <span>♥ {post._count.likes}</span>
                  <span>💬 {post._count.comments}</span>
                  <span>↻ {post._count.reposts}</span>
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
