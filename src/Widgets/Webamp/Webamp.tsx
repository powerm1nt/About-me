import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { WidgetProps } from "../types";

/**
 * Winamp, on the page, by way of Webamp.
 *
 * Loaded on demand rather than bundled. Webamp is around a megabyte of JavaScript with an emulated
 * skin renderer inside it, and a page whose owner has not put one on it should not pay for that —
 * so the import happens when the widget mounts, not when the app does.
 *
 * It is not mounted while the page is being arranged. Webamp's windows are draggable in their own
 * right, and two drag implementations over the same pixels means neither works: picking the widget
 * up would instead move the equaliser. Arranging shows a still frame; the player comes back the
 * moment you stop.
 */
export default function Webamp({ widget, editing }: WidgetProps) {
  const { t } = useTranslation();
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  const src = String(widget.props?.src ?? "").trim();
  const title = String(widget.props?.title ?? "").trim();
  const artist = String(widget.props?.artist ?? "").trim();

  useEffect(() => {
    if (editing) return;

    let disposed = false;
    // Typed as the instance rather than the class, since only the instance is used here.
    let player: { dispose: () => void } | null = null;

    void (async () => {
      const node = host.current;
      if (!node) return;

      try {
        const { default: WebampPlayer } = await import("webamp");

        // Mounted after the await, so a widget removed while the chunk was loading does not get a
        // player attached to a detached node.
        if (disposed || !host.current) return;

        // Only http(s), and only a URL that parses. This comes out of a stored document.
        let track: { url: string; metaData: { title: string; artist: string } } | null = null;
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
          // Stacked from the widget's own top-left rather than left where Webamp would float them:
          // this is a widget in a layout, and windows placed against the viewport would sit outside
          // whatever the board arranged. The offsets are the classic window heights — the main
          // window and the equaliser are a fixed 116px each.
          windowLayout: {
            main: { position: { top: 0, left: 0 } },
            equalizer: { position: { top: 116, left: 0 } },
            playlist: { position: { top: 232, left: 0 }, size: { extraHeight: 2, extraWidth: 0 } },
          },
        });

        player = instance;
        await instance.renderWhenReady(host.current);

        if (disposed) instance.dispose();
      } catch {
        // A chunk that will not load, or a browser Webamp cannot run in. Say so rather than leaving
        // an empty box that looks like a layout bug.
        if (!disposed) setFailed(true);
      }
    })();

    return () => {
      disposed = true;
      player?.dispose();
    };
  }, [editing, src, title, artist, t]);

  if (editing) {
    return (
      <div className="webamp-widget is-placeholder">
        <p className="webamp-placeholder-title">{t("widgets.webamp.label")}</p>
        <p className="webamp-placeholder-note">{t("webamp.paused")}</p>
        {src && <p className="webamp-placeholder-track">{title || src}</p>}
      </div>
    );
  }

  if (failed) return <p className="webamp-widget is-failed">{t("webamp.failed")}</p>;

  return <div className="webamp-widget" ref={host} />;
}
