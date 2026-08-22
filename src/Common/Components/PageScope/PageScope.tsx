import { useEffect, useState, type ReactNode } from "react";
import { fetchFeed } from "../../../Services/api";
import { fetchMyProfile, fetchProfile } from "../../../Services/profile";
import { usePageLayout } from "../../../Services/pageLayout";
import { resolveRoute, useRouter } from "../../../Services/router";
import { useAuth } from "../../../Services/auth";
import type { ProfileScope } from "../../../Types";
import { ProfileScopeProvider } from "../../../Widgets";

/**
 * The profile the page is about, in scope for every widget on it.
 *
 * Hoisted to the shell rather than living inside a profile component: widgets are placed by their
 * owner, so a bio or a heatmap can end up in a sidebar, and it should still have something to show.
 * Also decides whether the page is being arranged, which is a property of the route and the viewer
 * rather than of any one widget.
 */
export default function PageScope({ children }: { children: ReactNode }) {
  const { pathname } = useRouter();
  const route = resolveRoute(pathname);
  const auth = useAuth();
  const { setEditing } = usePageLayout();

  const wanted =
    route?.kind === "profile" ? route.handle : route?.kind === "customize" ? "@me" : null;

  // Tagged with what it was loaded for, so leaving a profile clears the scope by derivation rather
  // than by writing state from an effect.
  const [loaded, setLoaded] = useState<{ for: string; scope: ProfileScope } | null>(null);
  const scope = loaded && loaded.for === wanted ? loaded.scope : null;

  useEffect(() => {
    if (!wanted) return;

    let active = true;

    void (async () => {
      try {
        const handle = wanted === "@me" ? (await fetchMyProfile()).handle : wanted;
        if (!handle) return;

        const [profile, posts] = await Promise.all([
          fetchProfile(handle),
          fetchFeed({ author: handle, sort: "recent" }),
        ]);
        if (!active) return;

        const readme = posts.find((p) => p.slug === "README" || p.title === "README") ?? null;
        setLoaded({
          for: wanted,
          scope: {
            profile,
            posts,
            readme,
            timeline: posts.filter((p) => p.id !== readme?.id),
            handle,
          },
        });
      } catch {
        // No profile to put in scope; the widgets that need one render nothing.
      }
    })();

    return () => {
      active = false;
    };
  }, [wanted]);

  const canEdit =
    route?.kind === "customize" && auth.isSignedIn && (!scope || scope.profile.userId === auth.user?.id);

  useEffect(() => {
    setEditing(Boolean(canEdit));
    return () => setEditing(false);
  }, [canEdit, setEditing]);

  if (!scope) return <>{children}</>;

  return <ProfileScopeProvider value={scope}>{children}</ProfileScopeProvider>;
}
