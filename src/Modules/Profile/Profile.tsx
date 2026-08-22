import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import InfoBubble from "../../Common/Components/InfoBubble/InfoBubble";
import Skeleton from "../../Common/Components/Skeleton/Skeleton";
import WidgetBoard from "../../Common/Components/WidgetBoard/WidgetBoard";
import { fetchFeed } from "../../Services/api";
import { fetchProfile } from "../../Services/profile";
import type { ProfileData } from "../../Types";
import type { PostSummary } from "../../Types";
import { usePageLayout } from "../../Services/pageLayout";
import { useAuth } from "../../Services/auth";
import { ProfileScopeProvider } from "../../Widgets";

export interface ProfileProps {
  handle: string;
  /** Opens the page in edit mode. Reached from Customize in the account menu. */
  editing?: boolean;
}

/**
 * One person's profile.
 *
 * The page's shape is not decided here — it is whatever widgets are at the centre anchor, in
 * whatever order their owner left them. All this does is load the profile and its posts and put them
 * in scope, so that a bio widget or a heatmap has something to render wherever it has been placed.
 */
export default function Profile({ handle, editing = false }: ProfileProps) {
  const { t } = useTranslation();
  const auth = useAuth();
  const { anchors, setAnchor, editing: arranging, setEditing } = usePageLayout();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [posts, setPosts] = useState<PostSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    Promise.all([fetchProfile(handle), fetchFeed({ author: handle, sort: "recent" })])
      .then(([loadedProfile, loadedPosts]) => {
        if (!active) return;
        setProfile(loadedProfile);
        setPosts(loadedPosts);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      active = false;
    };
  }, [handle]);

  // Only the owner may rearrange, and only when they asked to: a visitor sees the finished page.
  const canEdit = editing && auth.isSignedIn && auth.user?.id === profile?.userId;

  useEffect(() => {
    setEditing(canEdit);
    // Leaving Customize has to put the page back into reading mode, or the handles follow you.
    return () => setEditing(false);
  }, [canEdit, setEditing]);

  if (error !== null) {
    return <InfoBubble title={`${t("profile.notFound")} ${error}`} className="md-component-danger" />;
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

  // The README is the bio. It is shown as the bio widget and left out of the timeline, so it does
  // not appear twice on the same page.
  const readme = posts.find((post) => post.slug === "README" || post.title === "README") ?? null;
  const timeline = posts.filter((post) => post.id !== readme?.id);

  return (
    <ProfileScopeProvider value={{ profile, posts, readme, timeline, handle }}>
      <div className="profile">
        <WidgetBoard
          widgets={anchors.center}
          flow="grid"
          editing={arranging}
          onChange={(next) => setAnchor("center", next)}
        />
      </div>
    </ProfileScopeProvider>
  );
}
