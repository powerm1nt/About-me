import { useEffect } from "react";
import "./FileViewer.scss";
import { marked } from "marked";
import hljs from "highlight.js";
import "./_hljs.scss";

const fileFetcher = async (url: string): Promise<string> => {
  const res = await fetch(url);
  return res.text();
};

const FileViewer = () => {
  const url = import.meta.env.DEV
    ? "http://localhost:5173/README.md"
    : "https://raw.githubusercontent.com/powerm1nt/About-me/refs/heads/main/README.md";

  useEffect(() => {
    fileFetcher(url)
      .then((res) => {
        const fileContentEl = document.querySelector<HTMLElement>(".file-content");
        if (fileContentEl) {
          const parsed = marked.parse(res);
          if (typeof parsed === "string") {
            fileContentEl.innerHTML = parsed;
          } else {
            parsed.then((html) => {
              fileContentEl.innerHTML = html;
              hljs.highlightAll();
            });
            return;
          }
          hljs.highlightAll();
        }
      })
      .catch(() => {
        const fileContentEl = document.querySelector<HTMLElement>(".file-content");
        if (fileContentEl) {
          fileContentEl.innerHTML = "<h1>Unable to fetch the file :/</h1>";
        }
      });
  }, [url]);

  return (
    <main className="main-content">
      <div className="main-content-container">
        <div className="file-content" />
      </div>
    </main>
  );
};

export default FileViewer;
