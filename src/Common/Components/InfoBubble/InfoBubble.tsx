import type { ReactNode } from "react";

export interface InfoBubbleProps {
  title?: string;
  text?: string;
  className?: string;
  children?: ReactNode;
  /** Pre-rendered markdown body, injected when this bubble comes from an <Info>/<Warning> tag. */
  html?: string;
}

/**
 * The `<Info>` / `<Warning>` / `<Tip>` / `<Danger>` callout that markdown articles can use, and
 * the site's generic error surface. A body mentioning a TypeError gets the `is-type-error`
 * treatment, which app.scss styles as a stack-trace panel rather than a prose callout.
 */
export default function InfoBubble({ title, text, className = "", children, html }: InfoBubbleProps) {
  const hasTypeError = /TypeError:/i.test(
    [title, text, typeof children === "string" ? children : ""].filter(Boolean).join(" ")
  );

  return (
    <div className={`cmpns cmpns-info-bubble ${hasTypeError ? "is-type-error" : ""} ${className}`.trim()}>
      <div className="info-icon-wrapper" aria-hidden="true">
        <svg
          className="info-icon"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </div>
      <div className="info-body">
        {title && <div className="info-title">{title}</div>}
        {html !== undefined ? (
          <div className="info-content" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <div className="info-content">{children ?? text}</div>
        )}
      </div>
    </div>
  );
}
