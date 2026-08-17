import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./Common/main.scss";
import App from "./App";

// #app (not #root): app.scss's layout rules hang off that id, and index.html's pre-boot skeleton
// lives inside it so the chrome is on screen before this bundle finishes parsing.
const container = document.getElementById("app");
if (!container) {
  throw new Error("Failed to find the #app element");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
