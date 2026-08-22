import { useTranslation } from "react-i18next";
import { ANCHORS } from "../../../Services/layout";
import type { Anchor } from "../../../Types";

/** The five slots drawn as they sit on the page, so picking one is pointing at it. */
export default function SlotPicker({
  value,
  filled,
  onChange,
}: {
  value: Anchor;
  /** Slots that actually hold something, so empty ones read as empty. */
  filled: ReadonlySet<Anchor>;
  onChange: (slot: Anchor) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="slot-picker" role="group" aria-label={t("layout.slots")}>
      {ANCHORS.map((slot) => (
        <button
          type="button"
          key={slot}
          className={`slot-picker-cell ${value === slot ? "is-active" : ""}`.trim()}
          style={{ gridArea: slot }}
          data-filled={filled.has(slot) ? "" : undefined}
          aria-pressed={value === slot}
          title={t(`anchors.${slot}`)}
          onClick={() => onChange(slot)}
        >
          <span>{t(`anchors.${slot}`)}</span>
        </button>
      ))}
    </div>
  );
}
