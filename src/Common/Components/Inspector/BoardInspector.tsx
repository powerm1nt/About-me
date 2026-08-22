import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FLOWS, SCROLLS } from "../../../Services/layout";
import { fetchFeed } from "../../../Services/api";
import { assetUrl } from "../../../Services/config";
import { fetchMyProfile } from "../../../Services/profile";
import { usePageLayout } from "../../../Services/pageLayout";
import type { BoardInspectorProps, PostMediaSummary } from "../../../Types";
import ConfirmDialog from "../ConfirmDialog/ConfirmDialog";
import Inspector from "./Inspector";
import { Group, Note, Select, TextField } from "./fields";

export default function BoardInspector({ anchor, trigger, onClose }: BoardInspectorProps) {
  const { t } = useTranslation();
  const { boards, setBoard, page, setPage, reset } = usePageLayout();
  const [confirmReset, setConfirmReset] = useState(false);
  const [media, setMedia] = useState<PostMediaSummary[] | null>(null);

  const board = boards[anchor];
  const wallpaper = page.wallpaper ?? { source: "bing" as const };

  useEffect(() => {
    if (wallpaper.source !== "media" || media !== null) return;

    let active = true;
    void fetchMyProfile()
      .then((profile) => (profile.handle ? fetchFeed({ author: profile.handle, kind: "media" }) : []))
      .then((posts) => {
        if (active) setMedia(posts.flatMap((post) => post.media));
      })
      .catch(() => {
        if (active) setMedia([]);
      });

    return () => {
      active = false;
    };
  }, [wallpaper.source, media]);

  const layout = () => (
    <>
      <Select
        label={t("board.layout")}
        value={String(board.flow)}
        options={FLOWS.map((flow) => ({ value: flow, label: t(`flows.${flow}`) }))}
        onChange={(flow) => setBoard(anchor, { flow })}
      />
      <Select
        label={t("inspector.scroll")}
        value={String(board.scroll)}
        options={SCROLLS.map((scroll) => ({ value: scroll, label: t(`inspector.scrolls.${scroll}`) }))}
        onChange={(scroll) => setBoard(anchor, { scroll })}
      />
      {board.scroll !== "none" && <Note>{t("inspector.scrollNote")}</Note>}
    </>
  );

  const pageTab = () => (
    <>
      <Select
        label={t("boardInspector.wallpaper")}
        value={wallpaper.source}
        options={(["bing", "url", "media"] as const).map((source) => ({
          value: source,
          label: t(`boardInspector.wallpapers.${source}`),
        }))}
        onChange={(source) => setPage({ wallpaper: { source, url: wallpaper.url } })}
      />

      {wallpaper.source === "url" && (
        <TextField
          label={t("boardInspector.wallpaperUrl")}
          value={wallpaper.url ?? ""}
          placeholder="https://"
          onChange={(url) => setPage({ wallpaper: { source: "url", url } })}
        />
      )}

      {wallpaper.source === "media" && (
        <Group label={t("boardInspector.pickMedia")}>
          {media === null ? (
            <Note>…</Note>
          ) : media.length === 0 ? (
            <Note>{t("boardInspector.noMedia")}</Note>
          ) : (
            <div className="inspector-media">
              {media.map((item) => {
                const full = assetUrl(item.path);
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={`inspector-media-tile ${wallpaper.url === full ? "is-active" : ""}`.trim()}
                    aria-pressed={wallpaper.url === full}
                    onClick={() => setPage({ wallpaper: { source: "media", url: full } })}
                  >
                    <img src={assetUrl(item.thumbPath ?? item.path)} alt={item.alt} loading="lazy" />
                  </button>
                );
              })}
            </div>
          )}
        </Group>
      )}

      <Note>{t("boardInspector.wallpaperNote")}</Note>
    </>
  );

  const advanced = () => (
    <>
      <Note>{t("boardInspector.resetNote")}</Note>
      <button
        type="button"
        className="widget-btn inspector-reset is-danger"
        onClick={() => setConfirmReset(true)}
      >
        {t("boardInspector.reset")}
      </button>
    </>
  );

  return (
    <>
      <Inspector
        title={t("board.settings")}
        subtitle={t(`anchors.${anchor}`)}
        anchor={trigger}
        align="right"
        onClose={onClose}
        tabs={[
          { id: "layout", label: t("boardInspector.tabs.layout"), render: layout },
          { id: "page", label: t("boardInspector.tabs.page"), render: pageTab },
          { id: "advanced", label: t("boardInspector.tabs.advanced"), render: advanced },
        ]}
      />

      {confirmReset && (
        <ConfirmDialog
          title={t("boardInspector.resetTitle")}
          message={t("boardInspector.resetMessage")}
          confirmLabel={t("boardInspector.reset")}
          cancelLabel={t("board.cancel")}
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => {
            reset();
            setConfirmReset(false);
            onClose();
          }}
        />
      )}
    </>
  );
}
