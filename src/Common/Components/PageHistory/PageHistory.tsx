import { useEffect, useState } from "react";
import Skeleton from "../Skeleton/Skeleton";
import InfoBubble from "../InfoBubble/InfoBubble";
import ExternalLink from "../ExternalLink/ExternalLink";
import MdContentRenderer from "../MdContentRenderer/MdContentRenderer";
import { previewMarkdown } from "../../../Services/api";
import {
  getRevisionDiff,
  getRevisions,
  hunkNewText,
  hunkOldText,
  type DiffHunk,
  type DiffLineType,
  type RevisionSummary,
} from "../../../Services/history";

export interface PageHistoryProps {
  filePath: string;
  isJapanese?: boolean;
  onClose: () => void;
}

const lineClass = (type: DiffLineType): string =>
  type === "added"
    ? "history-diff-line history-diff-added"
    : type === "removed"
      ? "history-diff-line history-diff-removed"
      : "history-diff-line";

const linePrefix = (type: DiffLineType): string =>
  type === "added" ? "+ " : type === "removed" ? "- " : "  ";

const firstLine = (message: string): string => message.split("\n")[0] ?? "";

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

async function renderMarkdown(markdown: string): Promise<string> {
  try {
    return await previewMarkdown(markdown);
  } catch {
    return '<p class="editor-status">Preview unavailable.</p>';
  }
}

/**
 * A page's edit history, read straight from the repo's patches/ folder on GitHub. Every merged
 * proposal left one patch file behind, so the list of commits touching patches/{page}/ *is* the
 * revision list, and each patch is the diff.
 */
export default function PageHistory({ filePath, isJapanese = false, onClose }: PageHistoryProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<RevisionSummary[]>([]);

  const [selectedSha, setSelectedSha] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [hunks, setHunks] = useState<DiffHunk[]>([]);
  const [tab, setTab] = useState<"text" | "preview">("text");
  const [previews, setPreviews] = useState<Record<number, { before: string; after: string }>>({});

  useEffect(() => {
    let active = true;

    getRevisions(filePath)
      .then((revs) => {
        if (active) setRevisions(revs);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [filePath]);

  const select = async (rev: RevisionSummary) => {
    if (selectedSha === rev.sha) {
      setSelectedSha(null);
      return;
    }

    setSelectedSha(rev.sha);
    setTab("text");
    setDetailLoading(true);
    setHunks([]);
    setPreviews({});

    try {
      setHunks(await getRevisionDiff(rev.sha, filePath));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDetailLoading(false);
    }
  };

  const selectTab = async (next: "text" | "preview") => {
    setTab(next);
    if (next !== "preview" || hunks.length === 0) return;

    const rendered = await Promise.all(
      hunks.map(async (hunk) => ({
        before: await renderMarkdown(hunkOldText(hunk)),
        after: await renderMarkdown(hunkNewText(hunk)),
      }))
    );
    setPreviews(Object.fromEntries(rendered.map((entry, i) => [i, entry])));
  };

  return (
    <div className="page-history">
      <div className="history-header">
        <h3>History</h3>
        <button type="button" className="editor-btn editor-btn-cancel" onClick={onClose}>
          Close
        </button>
      </div>

      {loading ? (
        <div className="history-skeleton" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <Skeleton className="skeleton-card" width="100%" key={i} />
          ))}
        </div>
      ) : error !== null ? (
        <InfoBubble title={`Could not load history: ${error}`} />
      ) : revisions.length === 0 ? (
        <p className="loading-text">No proposed edits have been merged for this page yet.</p>
      ) : (
        <ul className="history-list">
          {revisions.map((rev) => (
            <li className="history-item" key={rev.sha}>
              <button
                type="button"
                className={`history-entry ${rev.sha === selectedSha ? "is-active" : ""}`.trim()}
                onClick={() => void select(rev)}
              >
                {rev.authorAvatarUrl && (
                  <img src={rev.authorAvatarUrl} className="history-avatar" alt={rev.authorLogin} />
                )}
                <span className="history-entry-body">
                  <span className="history-message">{firstLine(rev.message)}</span>
                  <span className="history-meta">
                    {rev.authorLogin} · {formatDate(rev.date)}
                  </span>
                </span>
              </button>

              {rev.sha === selectedSha && (
                <div className="history-detail">
                  <div className="editor-tabs">
                    <button
                      type="button"
                      className={`editor-tab ${tab === "text" ? "is-active" : ""}`.trim()}
                      onClick={() => void selectTab("text")}
                    >
                      Text
                    </button>
                    <button
                      type="button"
                      className={`editor-tab ${tab === "preview" ? "is-active" : ""}`.trim()}
                      onClick={() => void selectTab("preview")}
                    >
                      Preview
                    </button>
                    <ExternalLink href={rev.htmlUrl} label="Commit on GitHub" className="history-view-commit">
                      View commit ↗
                    </ExternalLink>
                  </div>

                  {detailLoading ? (
                    <div className="history-diff-hunk history-diff-skeleton" aria-hidden="true">
                      {["40%", "85%", "65%", "90%", "55%", "75%"].map((w) => (
                        <Skeleton className="skeleton-line" width={w} key={w} />
                      ))}
                    </div>
                  ) : hunks.length === 0 ? (
                    <p className="loading-text">No diff available for this revision.</p>
                  ) : tab === "text" ? (
                    hunks.map((hunk, i) => (
                      <div className="history-diff-hunk" key={i}>
                        <div className="history-diff-line history-diff-header">{hunk.header}</div>
                        {hunk.lines.map((line, j) => (
                          <div className={lineClass(line.type)} key={j}>
                            {linePrefix(line.type)}
                            {line.text}
                          </div>
                        ))}
                      </div>
                    ))
                  ) : (
                    hunks.map((_hunk, i) => (
                      <div className="history-compare" key={i}>
                        <div className="history-compare-pane">
                          <h4>Before</h4>
                          {previews[i] ? (
                            <MdContentRenderer html={previews[i]!.before} isJapanese={isJapanese} />
                          ) : (
                            <div aria-hidden="true">
                              <Skeleton className="skeleton-title" width="55%" />
                              <Skeleton className="skeleton-line" width="100%" />
                              <Skeleton className="skeleton-line" width="92%" />
                              <Skeleton className="skeleton-line" width="70%" />
                            </div>
                          )}
                        </div>
                        <div className="history-compare-pane">
                          <h4>After</h4>
                          {previews[i] ? (
                            <MdContentRenderer html={previews[i]!.after} isJapanese={isJapanese} />
                          ) : (
                            <div aria-hidden="true">
                              <Skeleton className="skeleton-title" width="55%" />
                              <Skeleton className="skeleton-line" width="100%" />
                              <Skeleton className="skeleton-line" width="92%" />
                              <Skeleton className="skeleton-line" width="70%" />
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
