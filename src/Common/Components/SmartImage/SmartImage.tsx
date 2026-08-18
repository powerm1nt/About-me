import { useState, type CSSProperties } from "react";

export interface SmartImageProps {
  src: string;
  alt?: string;
  width?: string;
  height?: string;
  style?: CSSProperties;
  /** When true the wrapper is display:block (full-width). Default: inline. */
  block?: boolean;
}

type LoadState = "loading" | "loaded" | "error";

/** An <img> that holds its own space: a skeleton while loading, an alt-text placeholder if it fails. */
export default function SmartImage({ src, alt, width, height, style, block }: SmartImageProps) {
  const [state, setState] = useState<LoadState>("loading");

  const sizeStyle: CSSProperties = { width, height };

  return (
    <div className={`smart-img-wrap ${block ? "is-block" : ""}`.trim()} style={{ width }}>
      {state === "loading" && (
        <span
          className="skeleton smart-img-skeleton"
          style={{ width: width ?? "100%", height: height ?? "2em" }}
          aria-hidden="true"
        />
      )}

      {state === "error" && (
        <div
          className="smart-img-error"
          style={sizeStyle}
          role="img"
          aria-label={`Image unavailable: ${alt ?? ""}`}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="0" />
            <line x1="9" y1="9" x2="15" y2="15" />
            <line x1="15" y1="9" x2="9" y2="15" />
          </svg>
          <span>{alt ?? "image unavailable"}</span>
        </div>
      )}

      {/* Always rendered; hidden until loaded, removed from flow on error. */}
      <img
        src={src}
        alt={alt ?? ""}
        style={{ ...sizeStyle, display: state === "loaded" ? "block" : "none", ...style }}
        onLoad={() => setState("loaded")}
        onError={() => setState("error")}
      />
    </div>
  );
}
