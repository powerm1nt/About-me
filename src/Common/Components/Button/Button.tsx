import type { ReactNode } from "react";
import "./Button.scss";

export interface ButtonProps {
  className?: string;
  text?: string;
  children?: ReactNode;
}

export default function Button({ className, text, children }: ButtonProps) {
  return (
    <div className={`cmpns cmpns-button ${className ? className : ""}`}>
      {text ? text : children}
    </div>
  );
}
