import { Link } from "../../Services/router";

export interface AboutProps {
  isJapanese: boolean;
}

/**
 * What Hisuiki is, for someone who has just arrived. A page rather than a tab beside the feed: it is
 * read once, and a permanent tab spent prime space on it every visit.
 */
export default function About({ isJapanese }: AboutProps) {
  if (isJapanese) {
    return (
      <div className="about-page">
        <h1>Hisuikiとは</h1>
        <p className="about-lead">
          Hisuikiはメディア共有とブログのプラットフォームです。写真を投稿し、記事を書き、
          他の人が共有したものにコメントできます。
        </p>
        <p>
          アカウントごとに <code>{"{handle}"}.hisuiki.com</code> の専用スペースがあり、
          ページも見た目も自分のものです。書いたものはマークダウンのファイルとして保存され、
          いつでも取得でき、編集のたびにバージョンが残ります。
        </p>
        <p className="about-cta">
          <Link href="/ja">おすすめを見る</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="about-page">
      <h1>What Hisuiki is</h1>
      <p className="about-lead">
        Hisuiki is a media sharing and blogging platform. Post photos, write articles, and comment on
        what other people share.
      </p>
      <p>
        Every account gets its own space at <code>{"{handle}"}.hisuiki.com</code>, with its own pages
        and its own look. Writing is stored as markdown files you can fetch and keep, and every edit
        is versioned.
      </p>
      <p className="about-cta">
        <Link href="/">Go to For You</Link>
      </p>
    </div>
  );
}
