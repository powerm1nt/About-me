import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { defaultAnchors, readLayout, writeLayout } from "./layout";
import { fetchMyProfile, updateMyProfile } from "./profile";
import type { Anchor, AnchoredLayout, Widget } from "./profile";
import { useAuth } from "./auth";

interface PageLayoutValue {
  anchors: AnchoredLayout;
  /** Replaces one anchor's widgets, arming the autosave. */
  setAnchor: (anchor: Anchor, widgets: Widget[]) => void;
  /** True while the owner is arranging the page. */
  editing: boolean;
  setEditing: (editing: boolean) => void;
  saveState: "idle" | "saving" | "saved";
  saveError: string | null;
}

const PageLayoutContext = createContext<PageLayoutValue>({
  anchors: defaultAnchors(),
  setAnchor: () => {},
  editing: false,
  setEditing: () => {},
  saveState: "idle",
  saveError: null,
});

/**
 * The one layout document, for every anchor on the page.
 *
 * The header, the footer and the body are three anchors of the same document, so they cannot each
 * own a copy: two components fetching the same profile and writing back their own half would mean
 * whichever saved last erased the other. It is loaded once here and written once here.
 *
 * Saving is automatic and debounced. There is no Save button because the page is the editor — a
 * page you arrange by dragging things around it has no natural moment to press one — and the
 * debounce matters because a drag now reorders on every pointer move and a text widget changes on
 * every keystroke, so one gesture would otherwise be a burst of requests.
 */
export function PageLayoutProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();

  const [anchors, setAnchors] = useState<AnchoredLayout>(defaultAnchors);
  const [editing, setEditing] = useState(false);
  // Nothing is saved until the page has actually been touched, so merely opening Customize never
  // writes the layout back over itself.
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.isSignedIn) return;

    let active = true;
    fetchMyProfile()
      .then((profile) => {
        // A layout that arrived after the first edit would throw that edit away.
        if (active && !dirty) setAnchors(readLayout(profile.layout));
      })
      .catch(() => {
        // The default page is a working page; someone signed in but unreachable still gets one.
      });

    return () => {
      active = false;
    };
    // Deliberately not keyed on `dirty`: this runs when the session changes, and reads dirty only to
    // avoid clobbering. Re-running on every edit would refetch the profile mid-drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.isSignedIn]);

  useEffect(() => {
    if (!dirty || !auth.isSignedIn) return;

    // "Saving" is announced when the write actually starts, not when the timer is set: setting state
    // synchronously in an effect body cascades a render, and during a drag this re-runs on every
    // swap.
    const timer = window.setTimeout(() => {
      setSaveState("saving");
      updateMyProfile({ layout: writeLayout(anchors) })
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
  }, [dirty, anchors, auth.isSignedIn]);

  const setAnchor = (anchor: Anchor, widgets: Widget[]) => {
    setAnchors((current) => ({ ...current, [anchor]: widgets }));
    setDirty(true);
  };

  return (
    <PageLayoutContext.Provider
      value={{ anchors, setAnchor, editing, setEditing, saveState, saveError }}
    >
      {children}
    </PageLayoutContext.Provider>
  );
}

export const usePageLayout = (): PageLayoutValue => useContext(PageLayoutContext);
