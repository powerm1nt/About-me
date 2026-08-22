import { useTranslation } from "react-i18next";

/** Shown wherever a board is empty while arranging, so nothing looks broken or finished. */
export default function EmptyBoard({ label }: { label?: string }) {
  const { t } = useTranslation();

  return (
    <div className="empty-board">
      <svg viewBox="0 0 48 48" className="empty-board-icon" aria-hidden="true">
        {/* A dashed frame with an arrow dropping into it. */}
        <rect x="4" y="16" width="40" height="28" fill="none" stroke="currentColor" strokeWidth="2"
              strokeDasharray="5 4" />
        <path d="M24 4v18M17 15l7 7 7-7" fill="none" stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="square" />
      </svg>
      <p className="empty-board-text">{label ?? t("board.emptyTitle")}</p>
      <p className="empty-board-hint">{t("board.emptyHint")}</p>
    </div>
  );
}
