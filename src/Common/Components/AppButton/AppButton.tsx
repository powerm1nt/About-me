import type { ReactNode } from "react";

export interface AppButtonProps {
  text?: string;
  className?: string;
  children?: ReactNode;
}

export default function AppButton({ text, className = "", children }: AppButtonProps) {
  return <div className={`cmpns cmpns-button ${className}`.trim()}>{children ?? text}</div>;
}
