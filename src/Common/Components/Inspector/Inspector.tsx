import { useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import {
  FLOWS,
  SCROLLS,
  SIZES,
  WIDGETS,
  flowOf,
  isContainer,
  scrollOf,
} from "../../../Services/layout";
import {
  BORDERS,
  DEFAULT_STYLE,
  FONTS,
  FONT_KEYS,
  MAX_BLUR,
  PALETTE,
  SHADOWS,
  styleOf,
} from "../../../Services/widgetStyle";
import type { Widget, WidgetSize } from "../../../Services/profile";
import Anchored from "../Anchored/Anchored";

export interface InspectorProps {
  widget: Widget;
  /** The widget's own element, which the panel hangs from. */
  anchor: RefObject<HTMLElement | null>;
  onChange: (next: Widget) => void;
  onClose: () => void;
}

type Tab = "general" | "customize" | "advanced";

const TABS: Tab[] = ["general", "customize", "advanced"];

/**
 * The Inspector: everything about one widget, in one panel.
 *
 * Three tabs, because the questions are three different kinds. General is what the widget *is* — its
 * size, and the handful of settings particular to its kind. Customize is what it looks like, and is
 * a set of controls rather than a text box precisely so that the ordinary case never requires
 * writing CSS. Advanced is the text box, for the case the controls do not cover.
 *
 * It hangs off the widget rather than living in a sidebar, so there is never any doubt which widget
 * is being configured, and it is portalled out of the page so a container that clips or establishes
 * a stacking context cannot swallow it.
 *
 * Every change is applied immediately. There is no OK button because there is nothing to confirm:
 * the page behind the panel is the preview, and the page autosaves.
 */
export default function Inspector({ widget, anchor, onChange, onClose }: InspectorProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("general");

  const spec = WIDGETS[widget.kind];
  const style = styleOf(widget);

  const setProp = (key: string, value: string | number | boolean) =>
    onChange({ ...widget, props: { ...widget.props, [key]: value } });

  const setStyle = (patch: Partial<typeof style>) =>
    onChange({ ...widget, style: { ...widget.style, ...patch } });

  return (
    <Anchored anchor={anchor} className="inspector" gap={8}>
      <div role="dialog" aria-label={t("inspector.title")} className="inspector-body">
        <header className="inspector-head">
          <h2 className="inspector-title">{t(`widgets.${widget.kind}.label`)}</h2>
          <button type="button" className="inspector-close" onClick={onClose} aria-label={t("board.cancel")}>
            ✕
          </button>
        </header>

        <div className="inspector-tabs" role="tablist">
          {TABS.map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={tab === name}
              className={`inspector-tab ${tab === name ? "is-active" : ""}`.trim()}
              onClick={() => setTab(name)}
            >
              {t(`inspector.tabs.${name}`)}
            </button>
          ))}
        </div>

        <div className="inspector-panel" role="tabpanel">
          {tab === "general" && (
            <>
              <label className="inspector-field">
                <span>{t("inspector.size")}</span>
                <select
                  value={widget.size}
                  disabled={spec.sizes.length < 2}
                  onChange={(e) => onChange({ ...widget, size: e.target.value as WidgetSize })}
                >
                  {SIZES.filter((size) => spec.sizes.includes(size)).map((size) => (
                    <option key={size} value={size}>
                      {t(`inspector.sizes.${size}`)}
                    </option>
                  ))}
                </select>
              </label>

              {/* A container's one structural setting: which way its children run. */}
              {isContainer(widget) && (
                <label className="inspector-field">
                  <span>{t("board.layout")}</span>
                  <select
                    value={flowOf(widget)}
                    onChange={(e) => setProp("flow", e.target.value)}
                  >
                    {FLOWS.map((flow) => (
                      <option key={flow} value={flow}>
                        {t(`flows.${flow}`)}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {isContainer(widget) && (
                <>
                  <label className="inspector-field">
                    <span>{t("inspector.scroll")}</span>
                    <select
                      value={scrollOf(widget)}
                      onChange={(e) => setProp("scroll", e.target.value)}
                    >
                      {SCROLLS.map((scroll) => (
                        <option key={scroll} value={scroll}>
                          {t(`inspector.scrolls.${scroll}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {/* Said out loud because it surprises people, and because it is the same rule that
                      once clipped the header bar. */}
                  {scrollOf(widget) !== "none" && (
                    <p className="inspector-note">{t("inspector.scrollNote")}</p>
                  )}
                </>
              )}

              {widget.kind === "nav" && (
                <label className="inspector-field">
                  <span>{t("inspector.target")}</span>
                  <select
                    value={String(widget.props?.target ?? "home")}
                    onChange={(e) => setProp("target", e.target.value)}
                  >
                    {["home", "explore", "media"].map((target) => (
                      <option key={target} value={target}>
                        {t(`nav.${target}`)}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {widget.kind === "link" && (
                <>
                  <label className="inspector-field">
                    <span>{t("link.label")}</span>
                    <input
                      value={String(widget.props?.label ?? "")}
                      onChange={(e) => setProp("label", e.target.value)}
                    />
                  </label>
                  <label className="inspector-field">
                    <span>{t("link.href")}</span>
                    <input
                      value={String(widget.props?.href ?? "")}
                      placeholder="https://"
                      onChange={(e) => setProp("href", e.target.value)}
                    />
                  </label>
                </>
              )}

              {widget.kind === "webamp" && (
                <>
                  <label className="inspector-field">
                    <span>{t("webamp.src")}</span>
                    <input
                      value={String(widget.props?.src ?? "")}
                      placeholder="https://"
                      onChange={(e) => setProp("src", e.target.value)}
                    />
                  </label>
                  <label className="inspector-field">
                    <span>{t("webamp.title")}</span>
                    <input
                      value={String(widget.props?.title ?? "")}
                      onChange={(e) => setProp("title", e.target.value)}
                    />
                  </label>
                  <label className="inspector-field">
                    <span>{t("webamp.artist")}</span>
                    <input
                      value={String(widget.props?.artist ?? "")}
                      onChange={(e) => setProp("artist", e.target.value)}
                    />
                  </label>
                  {/* Off by default: all three windows is nearly 350px of page for something most
                      people want as a play button and a track name. */}
                  <label className="inspector-check">
                    <input
                      type="checkbox"
                      checked={widget.props?.equalizer === true}
                      onChange={(e) => setProp("equalizer", e.target.checked)}
                    />
                    <span>{t("webamp.equalizer")}</span>
                  </label>
                  <label className="inspector-check">
                    <input
                      type="checkbox"
                      checked={widget.props?.playlist === true}
                      onChange={(e) => setProp("playlist", e.target.checked)}
                    />
                    <span>{t("webamp.playlist")}</span>
                  </label>
                </>
              )}

              {/* Taking the slack at the end of a bar is a layout question, not a style one. */}
              <label className="inspector-check">
                <input
                  type="checkbox"
                  checked={widget.props?.push === true}
                  onChange={(e) => setProp("push", e.target.checked)}
                />
                <span>{t("inspector.push")}</span>
              </label>
            </>
          )}

          {tab === "customize" && (
            <>
              <label className="inspector-field">
                <span>
                  {t("inspector.blur")} <em>{style.blur}px</em>
                </span>
                <input
                  type="range"
                  min={0}
                  max={MAX_BLUR}
                  step={1}
                  value={style.blur}
                  onChange={(e) => setStyle({ blur: Number(e.target.value) })}
                />
              </label>

              <label className="inspector-field">
                <span>
                  {t("inspector.opacity")} <em>{Math.round((style.opacity ?? 0) * 100)}%</em>
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={style.opacity}
                  onChange={(e) => setStyle({ opacity: Number(e.target.value) })}
                />
              </label>

              <label className="inspector-field">
                <span>{t("inspector.border")}</span>
                <select
                  value={style.border}
                  onChange={(e) => setStyle({ border: e.target.value as typeof style.border })}
                >
                  {BORDERS.map((border) => (
                    <option key={border} value={border}>
                      {t(`inspector.borders.${border}`)}
                    </option>
                  ))}
                </select>
              </label>

              {/* What lifts an anchored bar off whatever is scrolling under it. */}
              <label className="inspector-field">
                <span>{t("inspector.shadow")}</span>
                <select
                  value={style.shadow}
                  onChange={(e) => setStyle({ shadow: e.target.value as typeof style.shadow })}
                >
                  {SHADOWS.map((shadow) => (
                    <option key={shadow} value={shadow}>
                      {t(`inspector.shadows.${shadow}`)}
                    </option>
                  ))}
                </select>
              </label>

              {/* Each option is drawn in its own face, and the line below shows it at reading size.
                  A list of font names in one font asks you to remember what they look like. */}
              <label className="inspector-field">
                <span>{t("inspector.font")}</span>
                <select
                  className="inspector-fonts"
                  value={style.font ?? "system"}
                  onChange={(e) =>
                    setStyle({ font: e.target.value === "system" ? undefined : e.target.value })
                  }
                >
                  {FONT_KEYS.map((key) => (
                    <option key={key} value={key} style={{ fontFamily: FONTS[key]!.stack || undefined }}>
                      {FONTS[key]!.label}
                    </option>
                  ))}
                </select>
              </label>

              <p
                className="inspector-font-preview"
                style={{ fontFamily: (style.font && FONTS[style.font]?.stack) || undefined }}
              >
                {t("inspector.fontSample")}
              </p>

              <div className="inspector-field">
                <span>{t("inspector.accent")}</span>

                {/* Swatches first: picking a colour that belongs with the rest of the page is a
                    different job from picking any colour at all, and a native input only does the
                    second. It is still there underneath for when none of these is the one. */}
                <div className="inspector-swatches" role="group" aria-label={t("inspector.accent")}>
                  {PALETTE.map((colour) => (
                    <button
                      type="button"
                      key={colour}
                      className={`inspector-swatch ${style.accent === colour ? "is-active" : ""}`.trim()}
                      style={{ background: colour }}
                      aria-label={colour}
                      aria-pressed={style.accent === colour}
                      title={colour}
                      onClick={() => setStyle({ accent: colour })}
                    />
                  ))}
                </div>

                <span className="inspector-colour">
                  <input
                    type="color"
                    aria-label={t("inspector.custom")}
                    value={style.accent ?? "#5468e0"}
                    onChange={(e) => setStyle({ accent: e.target.value })}
                  />
                  <code className="inspector-hex">{style.accent ?? t("inspector.inherited")}</code>
                  {/* Clearing it is a separate act: a colour input has no empty state to pick. */}
                  {style.accent && (
                    <button type="button" className="widget-btn" onClick={() => setStyle({ accent: undefined })}>
                      {t("inspector.clear")}
                    </button>
                  )}
                </span>
              </div>

              <button
                type="button"
                className="widget-btn inspector-reset"
                onClick={() => setStyle({ ...DEFAULT_STYLE, accent: undefined, font: undefined })}
              >
                {t("inspector.reset")}
              </button>
            </>
          )}

          {tab === "advanced" && (
            <>
              <label className="inspector-field">
                <span>{t("inspector.css")}</span>
                <textarea
                  className="inspector-css"
                  rows={10}
                  spellCheck={false}
                  value={style.css ?? ""}
                  placeholder={".widget-content { letter-spacing: 0.1em; }"}
                  onChange={(e) => setStyle({ css: e.target.value })}
                />
              </label>
              {/* Said plainly, because the rules that get dropped are dropped silently otherwise and
                  the author is left wondering why half their stylesheet did nothing. */}
              <p className="inspector-note">{t("inspector.cssNote")}</p>
            </>
          )}
        </div>
      </div>
    </Anchored>
  );
}
