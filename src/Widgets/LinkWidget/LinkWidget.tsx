import { useTranslation } from "react-i18next";
import ExternalLink from "../../Common/Components/ExternalLink/ExternalLink";
import type { WidgetProps } from "../../Types";

/**
 * A link somebody added themselves.
 *
 * Only http(s) is followed. A javascript: or data: URL here would run in the page, and this value
 * comes from a text field — so it is checked when rendered, not only when saved, because a stored
 * document can be edited by other means.
 */
export default function LinkWidget({ widget, editing, onChange }: WidgetProps) {
  const { t } = useTranslation();

  const label = String(widget.props?.label ?? "");
  const href = String(widget.props?.href ?? "");

  const set = (key: "label" | "href", value: string) =>
    onChange({ ...widget, props: { ...widget.props, [key]: value } });

  if (editing) {
    // Edited in place, as the thing it is: the field is the link, sized to what is typed.
    return (
      <span className="link-widget-edit">
        <input
          className="pivot-item pivot-name-input"
          value={label}
          size={Math.max(1, label.length || 4)}
          maxLength={40}
          placeholder={t("link.label")}
          aria-label={t("link.label")}
          onChange={(e) => set("label", e.target.value)}
        />
        <input
          className="editor-commit-input link-widget-href"
          value={href}
          placeholder="https://"
          aria-label={t("link.href")}
          onChange={(e) => set("href", e.target.value)}
        />
      </span>
    );
  }

  let safe: URL;
  try {
    safe = new URL(href);
  } catch {
    return null;
  }
  if (safe.protocol !== "https:" && safe.protocol !== "http:") return null;

  return (
    <ExternalLink
      href={safe.toString()}
      label={label || t("link.untitled")}
      className="pivot-item pivot-item-external"
    >
      {label || t("link.untitled")}
    </ExternalLink>
  );
}
