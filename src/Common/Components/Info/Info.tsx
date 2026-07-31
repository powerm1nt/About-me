import type { ReactNode } from "react";
import "./Info.scss";

export interface InfoProps {
  text?: string;
  title?: string;
  children?: ReactNode;
  className?: string;
}

export default function Info({ text, title, children, className = "" }: InfoProps) {
  const content = text || children;

  return (
    <div className={`cmpns cmpns-info-bubble ${className}`}>
      <div className="info-icon-wrapper" aria-hidden="true">
        <svg
          className="info-icon"
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
        <div className="info-content">{content}</div>
      </div>
    </div>
  );
}
