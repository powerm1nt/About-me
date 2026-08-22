import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { defaultAnchors, moveToAnchor, readBoards, readLayout, readPage, writeLayout } from "./layout";
import { fetchMyProfile, updateMyProfile } from "./profile";
import type { Anchor, AnchoredLayout, BoardSettings, PageSettings, Widget } from "../Types";
import { useAuth } from "./auth";

interface PageLayoutValue {
  anchors: AnchoredLayout;
  /**
   * Replaces one anchor's widgets, arming the autosave.
   *
   * Takes an updater as well as a list, the way setState does. That is what lets the boards hand out
   * change handlers with a stable identity: a handler that closes over the current list has to be
   * rebuilt whenever the list changes, and rebuilding it on every render defeats memoising the
   * widgets underneath it.
   */
  setAnchor: (anchor: Anchor, widgets: Widget[] | ((prev: Widget[]) => Widget[])) => void;
  /** How each anchor's own board is laid out, as distinct from any container inside it. */
  boards: Record<Anchor, BoardSettings>;
  setBoard: (anchor: Anchor, settings: BoardSettings) => void;
  /** Settings for the page as a whole: the wallpaper, for now. */
  page: PageSettings;
  setPage: (page: PageSettings) => void;
  /** Moves a widget from one anchor to another, for a drag that crosses boards. */
  moveWidget: (id: string, from: Anchor, to: Anchor) => void;
  /** Throws away every customisation and goes back to the page the app ships. */
  reset: () => void;
  /** True while the owner is arranging the page. */
  editing: boolean;
  setEditing: (editing: boolean) => void;
}

interface SaveStatusValue {
  saveState: "idle" | "saving" | "saved";
  saveError: string | null;
}

/**
 * Two contexts, not one.
 *
 * Save status changes twice per save — to "saving" and back — and the boards do not care about it.
 * While they shared a context, every autosave re-rendered every widget on the page, twice, a second
 * after each edit. What a component subscribes to should be what it actually reads.
 */
const emptyBoards = (): Record<Anchor, BoardSettings> => readBoards(undefined);

const PageLayoutContext = createContext<PageLayoutValue>({
  anchors: defaultAnchors(),
  setAnchor: () => {},
  boards: emptyBoards(),
  setBoard: () => {},
  page: { wallpaper: { source: "bing" } },
  setPage: () => {},
  moveWidget: () => {},
  reset: () => {},
  editing: false,
  setEditing: () => {},
});

const SaveStatusContext = createContext<SaveStatusValue>({ saveState: "idle", saveError: null });

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
  const [boards, setBoards] = useState<Record<Anchor, BoardSettings>>(emptyBoards);
  const [page, setPageState] = useState<PageSettings>(() => readPage(undefined));
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
        if (!active || dirty) return;
        setAnchors(readLayout(profile.layout));
        setBoards(readBoards(profile.layout?.boards));
        setPageState(readPage(profile.layout?.page));
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
      updateMyProfile({ layout: writeLayout(anchors, boards, page) })
        .then(() => {
          setSaveState("saved");
          setSaveError(null);
        })
        .catch((err: unknown) => {
          setSaveState("idle");
          setSaveError(err instanceof Error ? err.message : String(err));
        });
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [dirty, anchors, boards, page, auth.isSignedIn]);

  // Stable across renders, so a board holding onto it is not re-rendered by its identity changing.
  const setAnchor = useCallback(
    (anchor: Anchor, widgets: Widget[] | ((prev: Widget[]) => Widget[])) => {
      setAnchors((current) => ({
        ...current,
        [anchor]: typeof widgets === "function" ? widgets(current[anchor]) : widgets,
      }));
      setDirty(true);
    },
    [],
  );

  const setBoard = useCallback((anchor: Anchor, settings: BoardSettings) => {
    setBoards((current) => ({ ...current, [anchor]: { ...current[anchor], ...settings } }));
    setDirty(true);
  }, []);

  const moveWidget = useCallback((id: string, from: Anchor, to: Anchor) => {
    setAnchors((current) => moveToAnchor(current, id, from, to));
    setDirty(true);
  }, []);

  const setPage = useCallback((next: PageSettings) => {
    setPageState((current) => ({ ...current, ...next }));
    setDirty(true);
  }, []);

  /**
   * Back to the page the app ships.
   *
   * Everything at once, deliberately: a reset that left the header arranged and cleared only the
   * body would be a stranger thing to explain than one that starts over. Marked dirty so the empty
   * document is written, which is what makes it stick — a layout that is merely forgotten locally
   * comes back on the next load.
   */
  const reset = useCallback(() => {
    setAnchors(defaultAnchors());
    setBoards(emptyBoards());
    setPageState(readPage(undefined));
    setDirty(true);
  }, []);

  // Memoised for the same reason: a fresh object here re-renders every consumer on every render of
  // this provider, whatever actually changed.
  const layout = useMemo(
    () => ({ anchors, setAnchor, boards, setBoard, page, setPage, moveWidget, reset, editing, setEditing }),
    [anchors, setAnchor, boards, setBoard, page, setPage, moveWidget, reset, editing],
  );

  const status = useMemo(() => ({ saveState, saveError }), [saveState, saveError]);

  return (
    <PageLayoutContext.Provider value={layout}>
      <SaveStatusContext.Provider value={status}>{children}</SaveStatusContext.Provider>
    </PageLayoutContext.Provider>
  );
}

export const usePageLayout = (): PageLayoutValue => useContext(PageLayoutContext);

/** Subscribes to the save indicator alone, so reading it does not tie a component to the layout. */
export const useSaveStatus = (): SaveStatusValue => useContext(SaveStatusContext);
