import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { WidgetProps } from "../types";

/**
 * The size of the stack of classic windows, in pixels.
 *
 * Winamp's windows are a fixed 275 wide and 116 tall each; nothing about them reflows, which is why
 * the widget reserves exactly this much and centres it rather than trying to fill whatever space the
 * board gave it. Webamp centres its windows inside the element it is handed, so a host any larger
 * than the stack leaves the player adrift in the middle of an empty box.
 */
const WINDOW_WIDTH = 275;
const WINDOW_HEIGHT = 116;
const STACK_HEIGHT = WINDOW_HEIGHT * 3;

/**
 * Winamp, on the page, by way of Webamp.
 *
 * Loaded on demand rather than bundled. Webamp is around a megabyte of JavaScript with an emulated
 * skin renderer inside it, and a page whose owner has not put one on it should not pay for that —
 * so the import happens when the widget mounts, not when the app does.
 *
 * It is the real player everywhere it appears, including while the page is being arranged and in the
 * gallery. What changes in those places is only that it stops taking the pointer: Webamp's windows
 * are draggable in their own right, and two drag implementations over the same pixels means neither
 * works, so the player is made transparent to the pointer and the drag lands on the widget instead.
 * The instance stays alive across that, since tearing down an audio context to grey out a control
 * would stop whatever was playing.
 *
 * Its own window controls are disabled. Closing a window inside a widget leaves an empty box with no
 * titlebar left to reopen it from, and "minimise" means nothing for something already in a page
 * rather than on a desktop. The close is refused through Webamp's own onWillClose rather than only
 * hidden, so the context menu and the keyboard cannot get around it either.
 */
export default function Webamp({ widget, editing, preview }: WidgetProps) {
  const { t } = useTranslation();
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  const src = String(widget.props?.src ?? "").trim();
  const title = String(widget.props?.title ?? "").trim();
  const artist = String(widget.props?.artist ?? "").trim();

  // Deliberately not a reason to unmount: the player keeps running while the page is arranged.
  const inert = editing || preview;

  useEffect(() => {
    let disposed = false;
    let player: { dispose: () => void } | null = null;

    void (async () => {
      if (!host.current) return;

      try {
        const { default: WebampPlayer } = await import("webamp");

        // Checked after the await, so a widget removed while the chunk was loading does not get a
        // player attached to a node that has left the document.
        if (disposed || !host.current) return;

        // Only http(s), and only a URL that parses. This comes out of a stored document, not from
        // the field that last wrote it.
        let track: { url: string; metaData: { title: string; artist: string } } | undefined;
        if (src) {
          try {
            const url = new URL(src, window.location.href);
            if (url.protocol === "https:" || url.protocol === "http:") {
              track = {
                url: url.toString(),
                metaData: { title: title || t("webamp.untitled"), artist },
              };
            }
          } catch {
            // Not a URL. The player still opens; it just starts with an empty playlist.
          }
        }

        const instance = new WebampPlayer({
          initialTracks: track ? [track] : undefined,
          // Relative offsets: Webamp centres the whole set inside the host, so these only stack the
          // three windows against each other.
          windowLayout: {
            main: { position: { top: 0, left: 0 } },
            equalizer: { position: { top: WINDOW_HEIGHT, left: 0 } },
            playlist: { position: { top: WINDOW_HEIGHT * 2, left: 0 } },
          },
        });

        // Refused rather than merely hidden. A widget whose player has been closed is an empty box,
        // and there is no titlebar left to reopen it from.
        instance.onWillClose((cancel) => cancel());

        player = instance;
        await instance.renderWhenReady(host.current);

        if (disposed) instance.dispose();
      } catch {
        // A chunk that will not load, or a browser Webamp cannot run in. Say so rather than leaving
        // an empty box that reads as a layout bug.
        if (!disposed) setFailed(true);
      }
    })();

    return () => {
      disposed = true;
      player?.dispose();
    };
  }, [src, title, artist, t]);

  if (failed) return <p className="webamp-widget is-failed">{t("webamp.failed")}</p>;

  // Sized to the stack exactly, so Webamp's centring lands where the widget expects it.
  return (
    <div
      className={`webamp-widget ${inert ? "is-inert" : ""}`.trim()}
      ref={host}
      style={{ width: WINDOW_WIDTH, height: STACK_HEIGHT }}
    />
  );
}
