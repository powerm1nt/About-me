import { useCallback, useEffect, useRef, useState } from "react";
import Skeleton from "../Skeleton/Skeleton";
import InfoBubble from "../InfoBubble/InfoBubble";
import ExternalLink from "../ExternalLink/ExternalLink";
import MdContentRenderer from "../MdContentRenderer/MdContentRenderer";
import { createProposal, fetchRawPage, previewMarkdown } from "../../../Services/api";
import { useAuth } from "../../../Services/auth";
import { loadMonaco, type MonacoEditor, type MonacoRange } from "../../../Services/monaco";
import type { ProposalResult } from "../../../Services/types";

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const NUMBERED_LIST_PREFIX = /^\d+\.\s+/;

type EditorState = "loading" | "editing" | "submitting" | "success";

export interface PageEditorProps {
  filePath?: string;
  isJapanese?: boolean;
  isNewFile?: boolean;
  onClose: () => void;
}

/**
 * The "propose changes" editor. Nothing here writes to the site directly: the edited markdown is
 * sent to Server, which diffs it against the live content and opens a pull request from the
 * signed-in visitor's own GitHub account.
 */
export default function PageEditor({
  filePath = "",
  isJapanese = false,
  isNewFile = false,
  onClose,
}: PageEditorProps) {
  const auth = useAuth();

  const [state, setState] = useState<EditorState>("loading");
  const [activeTab, setActiveTab] = useState<"write" | "preview">("write");
  const [slug, setSlug] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [description, setDescription] = useState("");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [result, setResult] = useState<ProposalResult | null>(null);

  const rawContent = useRef("");
  const monacoHost = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MonacoEditor | null>(null);

  const effectivePath = isNewFile ? `blog/${slug}${isJapanese ? ".ja" : ""}.md` : filePath;
  const isSlugValid = SLUG_PATTERN.test(slug);
  const canPropose =
    state === "editing" && !loadFailed && commitMessage.trim() !== "" && (!isNewFile || isSlugValid);

  // Cross-author support: a new article's frontmatter is stamped with whoever is actually signed
  // in via GitHub, not a fixed site-owner name.
  const authorDisplayName = useCallback((): string => {
    const user = auth.user;
    if (!user) return "";
    return user.name ? `${user.name} (${user.login})` : user.login;
  }, [auth.user]);

  // Fetch the page's exact bytes (frontmatter included) so the proposed diff is generated against
  // the same source the patch will later be applied to.
  useEffect(() => {
    let active = true;

    const load = async () => {
      if (isNewFile) {
        const author = authorDisplayName().replace(/"/g, '\\"');
        rawContent.current = `---\ntitle: ""\ndescription: ""\nauthor: "${author}"\n---\n\n`;
      } else {
        try {
          const raw = await fetchRawPage(filePath);
          rawContent.current = raw.rawContent ?? "";
        } catch (err: unknown) {
          if (!active) return;
          setError(`Could not load page content (${err instanceof Error ? err.message : String(err)}).`);
          setLoadFailed(true);
        }
      }
      if (active) setState("editing");
    };

    void load();
    return () => {
      active = false;
    };
    // Intentionally runs once per editor session: rawContent is the editor's seed, and reloading
    // it under the user would discard whatever they'd already typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const replaceRange = (range: MonacoRange, text: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.executeEdits("toolbar", [{ range, text }]);
    editor.focus();
  };

  /**
   * Wraps the current selection with prefix/suffix (e.g. "**bold**"). If the selection already
   * carries the markers — either selected along with the text ("**bold**" fully selected) or
   * sitting immediately outside it ("bold" selected inside "**bold**") — removes them instead, so
   * clicking the same action twice toggles the formatting off. Inserts placeholder text when
   * nothing is selected, so the toolbar always produces valid markdown to type over.
   */
  const wrapSelection = (prefix: string, suffix: string, placeholder: string) => {
    const editor = editorRef.current;
    const selection = editor?.getSelection();
    const model = editor?.getModel();
    if (!editor || !selection || !model) return;

    const hasSelection =
      selection.startLineNumber !== selection.endLineNumber ||
      selection.startColumn !== selection.endColumn;

    if (!hasSelection) {
      replaceRange(selection, `${prefix}${placeholder}${suffix}`);
      return;
    }

    const selected = model.getValueInRange(selection);

    if (
      selected.length >= prefix.length + suffix.length &&
      selected.startsWith(prefix) &&
      selected.endsWith(suffix)
    ) {
      replaceRange(selection, selected.slice(prefix.length, selected.length - suffix.length));
      return;
    }

    const before =
      prefix.length > 0 && selection.startColumn - prefix.length >= 1
        ? model.getValueInRange({
            startLineNumber: selection.startLineNumber,
            startColumn: selection.startColumn - prefix.length,
            endLineNumber: selection.startLineNumber,
            endColumn: selection.startColumn,
          })
        : "";

    const after =
      suffix.length > 0
        ? model.getValueInRange({
            startLineNumber: selection.endLineNumber,
            startColumn: selection.endColumn,
            endLineNumber: selection.endLineNumber,
            endColumn: selection.endColumn + suffix.length,
          })
        : "";

    if (before === prefix && after === suffix) {
      replaceRange(
        {
          startLineNumber: selection.startLineNumber,
          startColumn: selection.startColumn - prefix.length,
          endLineNumber: selection.endLineNumber,
          endColumn: selection.endColumn + suffix.length,
        },
        selected
      );
      return;
    }

    replaceRange(selection, `${prefix}${selected}${suffix}`);
  };

  /**
   * Prefixes every line touched by the current selection (e.g. "> " for a quote). Numbered lists
   * get a sequential "1. ", "2. ", ... prefix instead of a fixed marker. If every touched line
   * already carries the marker, strips it instead — toggles the same way wrapSelection does.
   */
  const prefixLines = (marker: string, numbered = false) => {
    const editor = editorRef.current;
    const selection = editor?.getSelection();
    const model = editor?.getModel();
    if (!editor || !selection || !model) return;

    const range: MonacoRange = {
      startLineNumber: selection.startLineNumber,
      startColumn: 1,
      endLineNumber: selection.endLineNumber,
      // Monaco clamps this to the real end of the line; int32 max, not MAX_SAFE_INTEGER, since
      // its own position model is 32-bit.
      endColumn: 2147483647,
    };

    const lines = model.getValueInRange(range).split("\n");

    let newLines: string[];
    if (numbered) {
      const alreadyNumbered = lines.every((l) => NUMBERED_LIST_PREFIX.test(l));
      newLines = alreadyNumbered
        ? lines.map((l) => l.replace(NUMBERED_LIST_PREFIX, ""))
        : lines.map((l, i) => `${i + 1}. ${l}`);
    } else {
      const alreadyMarked = lines.every((l) => l.startsWith(marker));
      newLines = alreadyMarked
        ? lines.map((l) => l.slice(marker.length))
        : lines.map((l) => `${marker}${l}`);
    }

    replaceRange(range, newLines.join("\n"));
  };
  // Monaco is created imperatively once the host div exists, and torn down with the editor.
  useEffect(() => {
    if (state !== "editing" || loadFailed) return;

    let disposed = false;

    void loadMonaco()
      .then((monaco) => {
        const host = monacoHost.current;
        if (disposed || !host || editorRef.current) return;

        const editor = monaco.editor.create(host, {
          value: rawContent.current,
          language: "markdown",
          theme: "vs-dark",
          wordWrap: "on",
          automaticLayout: true,
          minimap: { enabled: false },
        });
        editorRef.current = editor;

        // Same actions as the toolbar buttons, on the shortcuts people already have in muscle memory.
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB, () => wrapSelection("**", "**", "bold text"));
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI, () => wrapSelection("*", "*", "italic text"));
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => wrapSelection("[", "](https://)", "link text"));
      })
      .catch((err: unknown) => {
        if (disposed) return;
        setError(`Could not load the editor (${err instanceof Error ? err.message : String(err)}).`);
        setLoadFailed(true);
      });

    return () => {
      disposed = true;
      editorRef.current?.dispose();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, loadFailed]);


  const refreshPreview = async () => {
    setPreviewHtml(null);
    const markdown = editorRef.current?.getValue() ?? rawContent.current;

    try {
      setPreviewHtml(await previewMarkdown(markdown));
    } catch {
      // Server unreachable — render locally instead of showing nothing. Custom component tags
      // won't expand (Server does that), but prose, headings and code all preview fine. Pulled in
      // on demand so the fallback renderer never lands in the main bundle.
      const { marked } = await import("marked");
      setPreviewHtml(await marked.parse(markdown));
    }
  };

  const selectTab = (tab: "write" | "preview") => {
    setActiveTab(tab);
    if (tab === "preview") void refreshPreview();
  };

  const propose = async () => {
    if (!canPropose || !editorRef.current) return;

    setState("submitting");
    setError(null);

    try {
      const proposal = await createProposal(auth.sessionId, {
        path: effectivePath,
        newContent: editorRef.current.getValue(),
        commitMessage: commitMessage.trim(),
        description: description.trim(),
      });
      setResult(proposal);
      setState("success");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setState("editing");
    }
  };

  if (state === "loading") {
    return (
      <div className="page-editor">
        <div className="editor-skeleton" aria-hidden="true">
          <div className="editor-skeleton-tabs">
            <Skeleton className="skeleton-tab" width="70px" />
            <Skeleton className="skeleton-tab" width="80px" />
          </div>
          <Skeleton className="skeleton-editor-block" width="100%" />
          <div className="editor-skeleton-fields">
            <Skeleton className="skeleton-field" width="100%" />
            <Skeleton className="skeleton-field-lg" width="100%" />
          </div>
          <div className="editor-skeleton-actions">
            <Skeleton className="skeleton-action" width="90px" />
            <Skeleton className="skeleton-action" width="160px" />
          </div>
        </div>
      </div>
    );
  }

  if (state === "success") {
    return (
      <div className="page-editor">
        <div className="editor-success">
          <p>
            Proposal opened —{" "}
            <ExternalLink href={result!.pullRequestUrl} label="Pull Request on GitHub">
              view the pull request on GitHub
            </ExternalLink>
            .
          </p>
          <button type="button" className="editor-btn editor-btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-editor">
      {isNewFile && (
        <div className="editor-slug-field">
          <label htmlFor="new-article-slug">URL slug</label>
          <input
            id="new-article-slug"
            className="editor-slug-input"
            placeholder="my-first-post"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            maxLength={80}
          />
          <span className="editor-slug-preview">→ {effectivePath}</span>
          {slug !== "" && !isSlugValid && (
            <span className="editor-slug-error">
              Lowercase letters, numbers and hyphens only (e.g. &quot;my-first-post&quot;).
            </span>
          )}
        </div>
      )}

      <div className="editor-tabs">
        <button
          type="button"
          className={`editor-tab ${activeTab === "write" ? "is-active" : ""}`.trim()}
          onClick={() => selectTab("write")}
        >
          Write
        </button>
        <button
          type="button"
          className={`editor-tab ${activeTab === "preview" ? "is-active" : ""}`.trim()}
          onClick={() => selectTab("preview")}
        >
          Preview
        </button>
      </div>

      {/* The Write pane is hidden rather than unmounted: tearing Monaco down and rebuilding it on
          every tab switch would drop undo history and cursor position. */}
      <div className="editor-pane" style={{ display: activeTab === "write" ? undefined : "none" }}>
        <div className="editor-toolbar" role="toolbar" aria-label="Formatting">
          <button type="button" className="toolbar-btn toolbar-btn-bold" title="Bold" onClick={() => wrapSelection("**", "**", "bold text")}>B</button>
          <button type="button" className="toolbar-btn toolbar-btn-italic" title="Italic" onClick={() => wrapSelection("*", "*", "italic text")}>I</button>
          <button type="button" className="toolbar-btn" title="Heading" onClick={() => prefixLines("## ")}>H</button>
          <span className="toolbar-sep" />
          <button type="button" className="toolbar-btn" title="Link" onClick={() => wrapSelection("[", "](https://)", "link text")}>Link</button>
          <button type="button" className="toolbar-btn" title="Image" onClick={() => wrapSelection("![", "](https://)", "alt text")}>Image</button>
          <button type="button" className="toolbar-btn toolbar-btn-code" title="Inline code" onClick={() => wrapSelection("`", "`", "code")}>Code</button>
          <span className="toolbar-sep" />
          <button type="button" className="toolbar-btn" title="Quote" onClick={() => prefixLines("> ")}>Quote</button>
          <button type="button" className="toolbar-btn" title="Bulleted list" onClick={() => prefixLines("- ")}>List</button>
          <button type="button" className="toolbar-btn" title="Numbered list" onClick={() => prefixLines("", true)}>1. List</button>
        </div>
        <div id="page-editor-monaco" className="page-editor-monaco" ref={monacoHost} />
      </div>

      {activeTab === "preview" && (
        <div className="editor-pane editor-preview">
          {previewHtml === null ? (
            <div aria-hidden="true">
              <Skeleton className="skeleton-title" width="55%" />
              <Skeleton className="skeleton-line" width="100%" />
              <Skeleton className="skeleton-line" width="92%" />
              <Skeleton className="skeleton-line" width="97%" />
              <Skeleton className="skeleton-line" width="70%" />
            </div>
          ) : (
            <MdContentRenderer html={previewHtml} isJapanese={isJapanese} />
          )}
        </div>
      )}

      <div className="editor-fields">
        <input
          className="editor-commit-input"
          placeholder="Commit message (required)"
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          maxLength={120}
        />
        <textarea
          className="editor-description-input"
          placeholder="Description (optional)"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {error !== null && <InfoBubble title={`Could not propose changes: ${error}`} />}

      <div className="editor-actions">
        <button
          type="button"
          className="editor-btn editor-btn-cancel"
          onClick={onClose}
          disabled={state === "submitting"}
        >
          Cancel
        </button>
        <button type="button" className="editor-btn editor-btn-primary" onClick={propose} disabled={!canPropose}>
          {state === "submitting" ? "Opening pull request…" : "Propose changes"}
        </button>
      </div>
    </div>
  );
}
