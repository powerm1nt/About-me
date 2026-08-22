import { Fragment, useState, useRef, useEffect, type ReactNode } from "react";
import Anchored from "../../Common/Components/Anchored/Anchored";
import ExternalLink from "../../Common/Components/ExternalLink/ExternalLink";
import HeadlineLogo from "../../Common/Components/HeadlineLogo/HeadlineLogo";
import SmartImage from "../../Common/Components/SmartImage/SmartImage";
import { Link, apexHref, profileHref, useRouter } from "../../Services/router";
import { fetchMyProfile, updateMyProfile, type ProfileLayout } from "../../Services/profile";
import {
  AVATAR_ID,
  linkId,
  moveHeaderItem,
  readHeaderLayout,
  removeHeaderItem,
  writeHeaderLayout,
  type HeaderItem,
} from "../../Services/headerLayout";
import { useFlip } from "../../Common/Hooks/useFlip";
import ConfirmDialog from "../../Common/Components/ConfirmDialog/ConfirmDialog";
import type { HeaderLink } from "../../Services/types";
import { useAuth, signInHref } from "../../Services/auth";

export interface HeaderProps {
  isJapanese: boolean;
}

export default function Header({ isJapanese }: HeaderProps) {
  const { pathname } = useRouter();
  const auth = useAuth();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLButtonElement>(null);
  const [myHandle, setMyHandle] = useState<string | null>(null);

  // The signed-in person's own header entries. They live on the profile, so the header is theirs to
  // arrange rather than a fixed strip of the app's choosing.
  const [fetchedLinks, setFetchedLinks] = useState<HeaderLink[]>([]);
  // Someone signed out has no header entries of their own, whatever was last fetched.
  const links = auth.isSignedIn ? fetchedLinks : [];

  /**
   * The stored arrangement, and the whole layout document it lives in.
   *
   * The document is kept intact rather than reduced to its header half: the profile board is in the
   * same field, and writing back only what the header knows about would erase it.
   */
  const [layout, setLayout] = useState<ProfileLayout>({});
  const items = readHeaderLayout(auth.isSignedIn ? layout.header : null, links);

  // The item being carried, by id rather than index: the order changes underneath a drag, so an
  // index would stop referring to the thing in your hand after the first swap.
  const [dragging, setDragging] = useState<string | null>(null);
  const draggedNode = useRef<HTMLElement | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<HeaderItem | null>(null);
  const flipRef = useFlip();

  /**
   * Adding a header entry happens in the strip itself, in two steps: the "+" becomes an invisible
   * field sized to what is typed, and Enter on a name opens a small popover for what it should do.
   * Naming a thing and deciding its behaviour are separate questions, and asking both at once — as
   * a form with two boxes did — makes the first feel like paperwork.
   */
  const [stage, setStage] = useState<"idle" | "naming" | "action">("idle");
  const [draft, setDraft] = useState({ label: "", href: "" });
  const [savingLink, setSavingLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const nameField = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLSpanElement>(null);

  const cancelAdding = () => {
    setStage("idle");
    setDraft({ label: "", href: "" });
    setLinkError(null);
  };

  useEffect(() => {
    // Signing out clears the fetched links by derivation below rather than by setting state here,
    // which would cascade a render.
    if (!auth.isSignedIn) return;

    let active = true;
    fetchMyProfile()
      .then((profile) => {
        if (!active) return;
        if (profile.handle) setMyHandle(profile.handle);
        setFetchedLinks(Array.isArray(profile.headerLinks) ? profile.headerLinks : []);
        setLayout(profile.layout ?? {});
      })
      .catch(() => {
        // A header that cannot load someone's own links still has to render the app's own.
      });

    return () => {
      active = false;
    };
  }, [auth.isSignedIn]);

  /**
   * Persists an arrangement, showing it immediately.
   *
   * Optimistic on purpose: dragging something and watching it snap back until a request returns
   * makes the strip feel like it is resisting you. A failed write leaves the local order ahead of
   * the stored one, which the next load corrects.
   */
  const saveItems = (next: HeaderItem[]) => {
    const header = writeHeaderLayout(next);
    setLayout((current) => ({ ...current, header }));
    void updateMyProfile({ layout: { ...layout, header } }).catch(() => {});
  };

  /**
   * Takes an item off the header.
   *
   * A link is genuinely deleted: it lives on the profile, and there is nowhere else it survives, so
   * removing it from the strip has to remove it from the list. It goes without asking because the
   * "+" beside it makes another in two keystrokes.
   *
   * A navigation entry asks first. It cannot be added back from the strip at all — the "+" makes
   * external links, not routes — so losing Home to a stray click would mean editing the stored
   * layout by hand to get it back.
   */
  const removeItem = (item: HeaderItem) => {
    if (item.kind === "link") {
      void removeLink(item);
      return;
    }
    setPendingRemoval(item);
  };

  const removeLink = async (item: HeaderItem) => {
    const next = links.filter((link) => linkId(link) !== item.id);
    setFetchedLinks(next);
    try {
      await updateMyProfile({ headerLinks: next });
    } catch {
      // The strip is already showing it gone; the next load is what corrects a failed write.
    }
  };

  /**
   * Reorders as the pointer passes over an item, rather than waiting for the drop.
   *
   * The midpoint rule is what stops that turning into a flicker. Once two items swap, the one in
   * your hand is sitting where the other was — still under the pointer, so the next dragover would
   * swap them straight back, and the pair would trade places for as long as you held still.
   */
  const reorderOver = (target: HeaderItem, event: { clientX: number; clientY: number }) => {
    if (dragging === null || dragging === target.id) return;

    const from = items.findIndex((item) => item.id === dragging);
    const to = items.findIndex((item) => item.id === target.id);
    if (from === -1 || to === -1 || from === to) return;

    const carried = draggedNode.current?.getBoundingClientRect();
    const over = flipRef.rect(target.id);

    if (carried && over) {
      // The strip is a row until it wraps, so this is usually the horizontal case.
      const horizontal = Math.abs(over.left - carried.left) > Math.abs(over.top - carried.top);
      const forward = from < to;

      if (horizontal) {
        const middle = over.left + over.width / 2;
        if (forward ? event.clientX < middle : event.clientX > middle) return;
      } else {
        const middle = over.top + over.height / 2;
        if (forward ? event.clientY < middle : event.clientY > middle) return;
      }
    }

    saveItems(moveHeaderItem(items, from, to));
  };

  const addLink = async () => {
    const label = draft.label.trim();
    const href = draft.href.trim();
    if (!label || !href) return;

    // Only http(s). A javascript: or data: URL in a link the header renders would run in the page,
    // and this value comes from a text field.
    let parsed: URL;
    try {
      parsed = new URL(href);
    } catch {
      setLinkError(isJapanese ? "URLが正しくありません。" : "That is not a valid URL.");
      return;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      setLinkError(isJapanese ? "http または https のみ使えます。" : "Only http and https links are allowed.");
      return;
    }

    setSavingLink(true);
    setLinkError(null);

    const next = [...links, { label, href: parsed.toString() }];

    try {
      await updateMyProfile({ headerLinks: next });
      setFetchedLinks(next);
      cancelAdding();
    } catch (err: unknown) {
      setLinkError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingLink(false);
    }
  };

  // Close menu on click outside. The panel is portalled to <body>, so containment has to be tested
  // against it as well as against the tile it hangs from.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if ((target as Element)?.closest?.(".metro-dropdown-menu")) return;
      setMenuOpen(false);
    };
    if (menuOpen) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  const activePath = pathname.replace(/^\/users\/[^/]+/, "") || "/";
  const isHomeActive = activePath === "/" || activePath === "/ja";
  // "photos" is still matched: it remains a route alias, so a shared link keeps highlighting Media.
  const isMediaActive = /^\/(media|photos)/.test(activePath.toLowerCase());
  const isExploreActive = activePath.toLowerCase().startsWith("/explore");
  // The header is part of what Customize arranges, so its own editing affordances live there too
  // rather than following the reader around every page.
  const isCustomizing = activePath.toLowerCase().startsWith("/customize");
  const canArrange = isCustomizing && auth.isSignedIn;

  // Always the feed. On a profile subdomain "/" is that person's profile, so Home points at the
  // apex instead — the feed is the whole site's, not one profile's.
  const homeHref = apexHref(isJapanese ? "/ja" : "/");
  const mediaHref = apexHref(isJapanese ? "/media/ja" : "/media");
  const exploreHref = apexHref(isJapanese ? "/explore/ja" : "/explore");

  const title = auth.isSignedIn && auth.user ? auth.user.name || "Hisuiki" : "Hisuiki";

  const NAV: Record<string, { href: string; active: boolean; label: string }> = {
    "nav:home": { href: homeHref, active: isHomeActive, label: isJapanese ? "ホーム" : "Home" },
    "nav:explore": { href: exploreHref, active: isExploreActive, label: isJapanese ? "みつける" : "Explore" },
    "nav:media": { href: mediaHref, active: isMediaActive, label: isJapanese ? "メディア" : "Media" },
  };

  /** What one item shows. Arranging is the wrapper's job, so nothing here knows about dragging. */
  const renderItem = (item: HeaderItem): ReactNode => {
    if (item.kind === "avatar") {
      return (
        <div className="metro-avatar-container" ref={menuRef}>
          <button
            className="metro-avatar-tile"
            ref={avatarRef}
            aria-label="User menu"
            title={title}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {auth.isSignedIn && auth.user?.image ? (
              <SmartImage
                src={auth.user.image}
                alt={title}
                width="100%"
                height="100%"
                style={{ objectFit: "cover", display: "block" }}
              />
            ) : (
              <HeadlineLogo />
            )}
          </button>
        </div>
      );
    }

    if (item.kind === "link" && item.link) {
      // External for now: these become real pages once profile pages can be authored, and the shape
      // stored is the same either way.
      return (
        <ExternalLink
          href={item.link.href}
          label={item.link.label}
          className="pivot-item pivot-item-external"
        >
          {item.link.label}
        </ExternalLink>
      );
    }

    const nav = NAV[item.id];
    if (!nav) return null;

    return (
      <Link href={nav.href} className={`pivot-item ${nav.active ? "is-active" : ""}`.trim()}>
        {nav.label}
      </Link>
    );
  };

  /**
   * The "+" that adds an entry. Not a header item itself — it is not arrangeable and nothing is
   * stored about it — so it is rendered just before the account tile rather than living in the
   * list. It follows the tile if the tile is moved, because the two are the strip's chrome and
   * separating them would leave the "+" stranded wherever the items happen to end.
   */
  const addControl = (
    <span className="pivot-add" ref={addRef} key="pivot-add">
      {stage === "idle" ? (
        <button
          type="button"
          className="pivot-item pivot-item-add"
          title={isJapanese ? "ヘッダーに追加" : "Add to your header"}
          onClick={() => {
            setStage("naming");
            // The field replaces the "+" in place, so focus has to follow it there.
            queueMicrotask(() => nameField.current?.focus());
          }}
        >
          +
        </button>
      ) : (
        <input
          ref={nameField}
          className="pivot-item pivot-name-input"
          value={draft.label}
          // Sized to its content so the strip does not lurch open on the first keystroke; it grows
          // as the name does, like the item it is about to become.
          size={Math.max(1, draft.label.length)}
          maxLength={40}
          aria-label={isJapanese ? "項目の名前" : "Name of the item"}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (draft.label.trim()) setStage("action");
            }
            if (e.key === "Escape") cancelAdding();
          }}
          // Leaving without a name is a cancelled thought, not a half-made item. With a name typed
          // the popover is open, so blur is just a click into it.
          onBlur={() => {
            if (stage === "naming" && !draft.label.trim()) cancelAdding();
          }}
        />
      )}
    </span>
  );

  return (
    <header className="metro-header">
      <div className="metro-header-row">
        {/* is-reordering suspends the dance for the duration of a drag: it is a transform, and it
            would otherwise offset every rect this measures to decide where an item goes. */}
        <nav
          className={[
            "metro-pivot",
            canArrange ? "is-arranging" : "",
            dragging !== null ? "is-reordering" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-label="Primary"
        >
          {items.map((item, index) => {
            const content = renderItem(item);
            if (content === null) return null;

            const entry = (
              <span
                key={item.id}
                ref={flipRef.node(item.id)}
                className={`header-item ${dragging === item.id ? "is-dragging" : ""}`.trim()}
                data-kind={item.kind}
                // Pinned right only while it still ends the strip; dragged inward it sits inline.
                data-tail={index === items.length - 1 ? "" : undefined}
                draggable={canArrange}
                onDragStart={(e) => {
                  draggedNode.current = e.currentTarget;
                  setDragging(item.id);
                }}
                onDragEnd={() => {
                  draggedNode.current = null;
                  setDragging(null);
                }}
                onDragOver={(e) => {
                  if (!canArrange) return;
                  e.preventDefault();
                  reorderOver(item, e);
                }}
                onDrop={(e) => {
                  if (!canArrange) return;
                  // The strip already shows the new order, so dropping only ends the gesture.
                  e.preventDefault();
                  draggedNode.current = null;
                  setDragging(null);
                }}
              >
                {content}

                {/* Header widgets are transparent: no panel, no label bar, nothing that would make
                    the strip stop looking like the strip. The only chrome is the corner badge an
                    iPhone puts on a jiggling icon, and it sits over the item rather than beside it. */}
                {canArrange && item.id !== AVATAR_ID && (
                  <button
                    type="button"
                    className="header-item-toggle"
                    aria-label={isJapanese ? "削除" : "Remove"}
                    title={isJapanese ? "削除" : "Remove"}
                    onClick={() => removeItem(item)}
                  >
                    ✕
                  </button>
                )}
              </span>
            );

            if (item.kind === "avatar" && isCustomizing) {
              return (
                <Fragment key={item.id}>
                  {addControl}
                  {entry}
                </Fragment>
              );
            }

            return entry;
          })}
        </nav>
      </div>

      {/* Both panels hang outside the strip: it scrolls horizontally, and a horizontal scroller
          clips vertically too, so anything absolutely positioned inside it is cut off and drags the
          strip into scrolling after it. Anchored portals them to <body> instead. */}
      {stage === "action" && (
        <Anchored anchor={addRef} className="pivot-action-popover" gap={12}>
          <div role="dialog" aria-label={draft.label}>
            <p className="pivot-action-title">
              {isJapanese ? `「${draft.label}」を押したとき` : `When “${draft.label}” is clicked`}
            </p>

            {/* One kind for now. It is a list rather than a fixed label because pages are the next
                kind, and the stored shape already allows for them. */}
            <label className="pivot-action-kind">
              <input type="radio" name="pivot-action" defaultChecked readOnly />
              <span>{isJapanese ? "リンクを開く" : "Open a link"}</span>
            </label>

            <input
              className="editor-commit-input pivot-action-url"
              placeholder="https://"
              autoFocus
              value={draft.href}
              onChange={(e) => setDraft({ ...draft, href: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addLink();
                }
                if (e.key === "Escape") cancelAdding();
              }}
            />

            {linkError !== null && <p className="pivot-action-error">{linkError}</p>}

            <div className="pivot-action-buttons">
              <button type="button" className="editor-btn editor-btn-cancel" onClick={cancelAdding}>
                {isJapanese ? "キャンセル" : "Cancel"}
              </button>
              <button
                type="button"
                className="editor-btn editor-btn-primary"
                onClick={() => void addLink()}
                disabled={savingLink || !draft.href.trim()}
              >
                {savingLink ? "…" : "OK"}
              </button>
            </div>
          </div>
        </Anchored>
      )}

      {pendingRemoval !== null && (
        <ConfirmDialog
          title={isJapanese ? "この項目を削除しますか？" : "Remove this from your header?"}
          message={
            isJapanese
              ? "ヘッダーから外れます。戻すにはレイアウトを編集し直す必要があります。"
              : "It comes off the strip straight away. The + adds external links, not app pages, so putting this one back means editing your stored layout."
          }
          confirmLabel={isJapanese ? "削除" : "remove"}
          cancelLabel={isJapanese ? "キャンセル" : "cancel"}
          onCancel={() => setPendingRemoval(null)}
          onConfirm={() => {
            saveItems(removeHeaderItem(items, pendingRemoval.id));
            setPendingRemoval(null);
          }}
        />
      )}

      {menuOpen && (
        <Anchored anchor={avatarRef} align="right" className="metro-dropdown-menu" gap={4}>
          {auth.isSignedIn ? (
            <>
              <div className="metro-dropdown-identity">
                <div className="metro-dropdown-name">{auth.user?.name || "User"}</div>
                <div className="metro-dropdown-email">{auth.user?.email}</div>
              </div>

              <a
                href={myHandle ? profileHref(myHandle) : "#"}
                className="metro-dropdown-item"
                onClick={(e) => {
                  if (!myHandle) {
                    e.preventDefault();
                    alert(isJapanese ? "プロフィールを設定してください" : "Please set a handle in Settings first.");
                  } else setMenuOpen(false);
                }}
              >
                {isJapanese ? "プロフィール" : "Profile"}
              </a>

              <Link href="/customize" className="metro-dropdown-item" onClick={() => setMenuOpen(false)}>
                {isJapanese ? "カスタマイズ" : "Customize"}
              </Link>

              <Link href="/settings" className="metro-dropdown-item" onClick={() => setMenuOpen(false)}>
                {isJapanese ? "設定" : "Settings"}
              </Link>

              <button
                className="metro-dropdown-item"
                onClick={() => {
                  setMenuOpen(false);
                  void auth.signOut();
                }}
              >
                {isJapanese ? "サインアウト" : "Sign out"}
              </button>
            </>
          ) : (
            <a href={signInHref(isJapanese)} className="metro-dropdown-item" onClick={() => setMenuOpen(false)}>
              {isJapanese ? "サインイン" : "Sign in"}
            </a>
          )}
        </Anchored>
      )}
    </header>
  );
}
