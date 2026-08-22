import { useEffect, useState, type ReactNode } from "react";
import ActivityHeatmap from "../../Common/Components/ActivityHeatmap/ActivityHeatmap";
import ExternalLink from "../../Common/Components/ExternalLink/ExternalLink";
import InfoBubble from "../../Common/Components/InfoBubble/InfoBubble";
import Skeleton from "../../Common/Components/Skeleton/Skeleton";
import SmartImage from "../../Common/Components/SmartImage/SmartImage";
import { fetchFeed } from "../../Services/api";
import { fetchProfile } from "../../Services/profile";
import { assetUrl } from "../../Services/config";
import type { ProfileData } from "../../Services/profile";
import type { PostSummary } from "../../Services/types";
import WidgetBoard from "../../Common/Components/WidgetBoard/WidgetBoard";
import WidgetGallery from "../../Common/Components/WidgetGallery/WidgetGallery";
import { addWidget, readLayout, writeLayout } from "../../Services/layout";
import { updateMyProfile } from "../../Services/profile";
import type { Widget, WidgetKind } from "../../Services/profile";
import { useAuth } from "../../Services/auth";

export interface ProfileProps {
  handle: string;
  isJapanese: boolean;
  /** Opens the board in edit mode. Reached from Customize in the header's profile menu. */
  editing?: boolean;
}

const TEXT = {
  en: { posts: "Posts", media: "Media", empty: "Nothing posted yet.", notFound: "No such profile." },
  ja: { posts: "投稿", media: "メディア", empty: "まだ投稿がありません。", notFound: "プロフィールが見つかりません。" },
} as const;

/**
 * One person's profile: who they are at the top, what they have been doing in the middle, and
 * everything they have posted below.
 *
 * The bio is a post rather than a text column — the one titled README — so it is written with the
 * same editor, sanitised by the same pipeline, and versioned in the same bucket as anything else.
 */
export default function Profile({ handle, isJapanese, editing = false }: ProfileProps) {
  const text = isJapanese ? TEXT.ja : TEXT.en;
  const auth = useAuth();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [posts, setPosts] = useState<PostSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"posts" | "media">("posts");
  const [widgets, setWidgets] = useState<Widget[] | null>(null);
  // Nothing is saved until the arrangement has actually been touched, so simply opening Customize
  // never writes the board back over itself.
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    Promise.all([fetchProfile(handle), fetchFeed({ author: handle, sort: "recent" })])
      .then(([loadedProfile, loadedPosts]) => {
        if (!active) return;
        setProfile(loadedProfile);
        setPosts(loadedPosts);
        setWidgets(readLayout(loadedProfile.layout));
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      active = false;
    };
  }, [handle]);

  /**
   * Autosave.
   *
   * There is no Save button: the board is the page, and a page you are arranging by dragging things
   * around it has no natural moment to press one. The write is debounced because a drag now reorders
   * on every pointer move and a text widget changes on every keystroke — without it, one gesture
   * would be a burst of requests.
   *
   * A failed save is reported on its own rather than through `error`, which would replace the whole
   * profile with a message and take the unsaved arrangement with it.
   */
  useEffect(() => {
    if (!editing || !dirty || widgets === null) return;

    // "Saving" is announced when the write actually starts, not when the timer is set: setting state
    // synchronously in an effect body cascades a render, and during a drag that effect re-runs on
    // every swap.
    const timer = window.setTimeout(() => {
      setSaveState("saving");
      updateMyProfile({ layout: writeLayout(widgets) })
        .then(() => {
          setSaveState("saved");
          setSaveError(null);
        })
        .catch((err: unknown) => {
          setSaveState("idle");
          setSaveError(err instanceof Error ? err.message : String(err));
        });
    }, 700);

    return () => window.clearTimeout(timer);
  }, [editing, dirty, widgets]);

  if (error !== null) {
    return <InfoBubble title={`${text.notFound} ${error}`} className="md-component-danger" />;
  }

  if (profile === null || posts === null) {
    return (
      <div className="profile" aria-hidden="true">
        <Skeleton className="profile-avatar-skeleton" />
        <Skeleton className="skeleton-title" width="40%" />
        <Skeleton className="skeleton-line" width="80%" />
      </div>
    );
  }

  // The README is the bio. It is shown at the top and left out of the timeline below, so it does not
  // appear twice on the same page.
  const readme = posts.find((post) => post.slug === "README" || post.title === "README");
  const timeline = posts.filter((post) => post.id !== readme?.id);
  const shown = tab === "media" ? timeline.filter((post) => post.media.length > 0) : timeline;

  const displayName = profile.user?.name || profile.handle || handle;

  const board = widgets ?? readLayout(profile.layout);

  // Only the owner may rearrange, and only when they asked to: a visitor sees the finished page.
  const canEdit = editing && auth.isSignedIn && auth.user?.id === profile.userId;

  // Every change goes through here, so nothing can alter the board without arming the autosave.
  const change = (next: Widget[]) => {
    setWidgets(next);
    setDirty(true);
  };

  const rendered: Record<string, ReactNode> = {
    identity: (
      <header className="profile-head" key="identity">
        <div className="profile-identity">
          {profile.avatarPath || profile.user?.image ? (
            <SmartImage
              src={profile.avatarPath ? assetUrl(profile.avatarPath) : profile.user!.image!}
              alt=""
              width="96px"
              height="96px"
              style={{ borderRadius: "50%" }}
            />
          ) : (
            <div className="profile-avatar-fallback" aria-hidden="true">
              {displayName.slice(0, 1).toUpperCase()}
            </div>
          )}

          <div className="profile-names">
            <h1 className="profile-name">{displayName}</h1>
            <p className="profile-handle">@{profile.handle ?? handle}</p>
            {profile.headline && <p className="profile-headline">{profile.headline}</p>}
          </div>
        </div>

        {/* Only the fields that were filled in: a row of empty labels tells a visitor nothing and
            makes every sparse profile look unfinished. */}
        <dl className="profile-facts">
          {profile.pronouns && (
            <div className="profile-fact">
              <dt>{isJapanese ? "代名詞" : "Pronouns"}</dt>
              <dd>{profile.pronouns}</dd>
            </div>
          )}
          {profile.location && (
            <div className="profile-fact">
              <dt>{isJapanese ? "場所" : "Location"}</dt>
              <dd>{profile.location}</dd>
            </div>
          )}
          {profile.publicEmail && (
            <div className="profile-fact">
              <dt>{isJapanese ? "メール" : "Email"}</dt>
              <dd>
                <a href={`mailto:${profile.publicEmail}`}>{profile.publicEmail}</a>
              </dd>
            </div>
          )}
        </dl>

        {profile.profileLinks.length > 0 && (
          <ul className="profile-links">
            {profile.profileLinks.map((link) => (
              <li key={link.href}>
                <ExternalLink href={link.href} label={link.label}>
                  {link.label}
                </ExternalLink>
              </li>
            ))}
          </ul>
        )}
      </header>
    ),

    links:
      profile.profileLinks.length > 0 ? (
        <ul className="profile-links" key="links">
          {profile.profileLinks.map((link) => (
            <li key={link.href}>
              <ExternalLink href={link.href} label={link.label}>
                {link.label}
              </ExternalLink>
            </li>
          ))}
        </ul>
      ) : null,

    bio: readme?.renderedHtml ? (
      // Sanitised on the server, with its stylesheet scoped to this post's own container.
      <section
        className="profile-bio"
        key="bio"
        data-post={readme.id}
        dangerouslySetInnerHTML={{ __html: readme.renderedHtml }}
      />
    ) : null,

    heatmap: (
      <ActivityHeatmap key="heatmap" dates={timeline.map((post) => post.createdAt)} isJapanese={isJapanese} />
    ),

    timeline: (
      <div key="timeline">
        <nav className="profile-tabs">
          <button
            type="button"
            className={`landing-tab ${tab === "posts" ? "is-active" : ""}`.trim()}
            onClick={() => setTab("posts")}
          >
            {text.posts}
          </button>
          <button
            type="button"
            className={`landing-tab ${tab === "media" ? "is-active" : ""}`.trim()}
            onClick={() => setTab("media")}
          >
            {text.media}
          </button>
        </nav>

        {shown.length === 0 ? (
          <p className="loading-text">{text.empty}</p>
        ) : (
          <div className="feed">
            {shown.map((post) => (
              <article className="feed-post" key={post.id} data-post={post.id}>
                {post.title && <h3 className="feed-title">{post.title}</h3>}
                {post.media[0] && (
                  <SmartImage
                    src={assetUrl(post.media[0].thumbPath ?? post.media[0].path)}
                    alt={post.media[0].alt}
                    block
                  />
                )}
                <div className="feed-body" dangerouslySetInnerHTML={{ __html: post.renderedHtml ?? "" }} />
                <footer className="feed-post-foot">
                  <span>♥ {post._count.likes}</span>
                  <span>💬 {post._count.comments}</span>
                  <span>↻ {post._count.reposts}</span>
                </footer>
              </article>
            ))}
          </div>
        )}
      </div>
    ),
  };

  return (
    <div className="profile">
      {/* The shelf comes before the profile it builds: you pick a widget, and it lands on the page
          below where you can see it. */}
      {canEdit && (
        <WidgetGallery
          isJapanese={isJapanese}
          onAdd={(kind: WidgetKind) => change(addWidget(board, kind))}
          // The real thing, with this profile's own content in it. The text widget is the exception:
          // on the board it is a pair of empty inputs, which shows nothing about what it becomes, so
          // the card shows what one looks like once written instead.
          renderPreview={(kind: WidgetKind) =>
            kind === "text" ? (
              <>
                <h2 className="widget-heading">{isJapanese ? "見出し" : "A heading"}</h2>
                <p>
                  {isJapanese
                    ? "自分で書いた文章をプロフィールに置けます。"
                    : "Words of your own, anywhere on your profile."}
                </p>
              </>
            ) : (
              rendered[kind] ?? null
            )
          }
        />
      )}

      {canEdit && saveError !== null && (
        <InfoBubble title={saveError} className="md-component-danger" />
      )}

      {canEdit && saveState !== "idle" && (
        <p className="editor-status" role="status">
          {saveState === "saving"
            ? isJapanese ? "保存中…" : "Saving…"
            : isJapanese ? "保存しました。" : "Saved."}
        </p>
      )}

      <WidgetBoard
        widgets={board}
        isJapanese={isJapanese}
        editing={canEdit}
        onChange={change}
        render={(widget) => {
          if (widget.kind === "text") {
            const heading = String(widget.props?.heading ?? "");
            const bodyText = String(widget.props?.body ?? "");

            // In edit mode a text widget is written in place; a visitor sees only the result.
            if (canEdit) {
              return (
                <div className="widget-text-fields">
                  <input
                    className="editor-commit-input"
                    placeholder={isJapanese ? "見出し" : "Heading"}
                    value={heading}
                    onChange={(e) =>
                      change(board.map((w) =>
                        w.id === widget.id ? { ...w, props: { ...w.props, heading: e.target.value } } : w))
                    }
                  />
                  <textarea
                    className="editor-description-input"
                    rows={3}
                    placeholder={isJapanese ? "本文" : "Text"}
                    value={bodyText}
                    onChange={(e) =>
                      change(board.map((w) =>
                        w.id === widget.id ? { ...w, props: { ...w.props, body: e.target.value } } : w))
                    }
                  />
                </div>
              );
            }

            if (!heading && !bodyText) return null;
            return (
              <>
                {heading && <h2 className="widget-heading">{heading}</h2>}
                {bodyText && <p>{bodyText}</p>}
              </>
            );
          }

          return rendered[widget.kind] ?? null;
        }}
      />
    </div>
  );
}
