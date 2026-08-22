import { useTranslation } from "react-i18next";
import type { WidgetProps } from "../types";

/**
 * A widget that holds other widgets.
 *
 * This is what makes the header a header: a container at the top anchor whose children run in a row.
 * Nothing about it is specific to being a header, which is the point — the same widget makes a
 * footer, a sidebar, or a two-column strip in the middle of a profile, depending only on where it
 * sits and which flow it is set to.
 *
 * The children arrive already rendered as a board, so dragging, nesting and the gallery stay the
 * board's business rather than being reimplemented here.
 */
export default function Container({ editing, children }: WidgetProps) {
  const { t } = useTranslation();

  return (
    <>
      {children}
      {/* An empty container is invisible, which makes one you just added look like it failed. */}
      {editing && <p className="container-empty-hint">{t("board.empty")}</p>}
    </>
  );
}
