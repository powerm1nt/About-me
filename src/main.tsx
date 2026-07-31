import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./Common/main.scss";
import { FileViewer, Header, Footer } from "./Modules";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Failed to find the root element");
}

const root = createRoot(container);
root.render(
  <StrictMode>
    <Header />
    <FileViewer />
    <Footer />
  </StrictMode>
);
