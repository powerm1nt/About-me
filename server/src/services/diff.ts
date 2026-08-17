/**
 * Produces a classic unified diff (the text format GNU `patch` consumes) between two full file
 * contents.
 *
 * This is a direct port of the C# DiffService rather than a call to jsdiff's own `createPatch`,
 * and the reason is compatibility: `createPatch` emits an `Index:`/`===` preamble and its own
 * header spelling, while every patch already sitting in `patches/` — and the apply-patches and
 * check-patches workflows that consume them — expects exactly the `--- a/<path>` / `+++ b/<path>`
 * form produced below. Changing the shape would strand the existing patch history.
 *
 * jsdiff supplies the line-level diff; the hunk grouping, context window and `@@` headers are
 * assembled here to match the previous output byte for byte.
 */
import { diffLines } from "diff";

const CONTEXT_LINES = 3;

type ChangeType = "unchanged" | "deleted" | "inserted";

interface Line {
  type: ChangeType;
  text: string;
  oldLineNo: number;
  newLineNo: number;
}

/**
 * Splitting "…last line\n" on '\n' yields a phantom empty trailing element that doesn't correspond
 * to a real line. Left in, it becomes a spurious final context line that never lines up with the
 * real file, forcing `patch` to fall back to fuzzy matching.
 */
function trimTrailingNewline(text: string): string {
  if (text.endsWith("\r\n")) return text.slice(0, -2);
  if (text.endsWith("\n")) return text.slice(0, -1);
  return text;
}

function toLines(value: string): string[] {
  const lines = value.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function toSequentialLines(oldText: string, newText: string): Line[] {
  const lines: Line[] = [];
  let oldLineNo = 1;
  let newLineNo = 1;

  for (const part of diffLines(oldText, newText)) {
    for (const text of toLines(part.value)) {
      if (part.removed) {
        lines.push({ type: "deleted", text, oldLineNo, newLineNo });
        oldLineNo++;
      } else if (part.added) {
        lines.push({ type: "inserted", text, oldLineNo, newLineNo });
        newLineNo++;
      } else {
        lines.push({ type: "unchanged", text, oldLineNo, newLineNo });
        oldLineNo++;
        newLineNo++;
      }
    }
  }

  return lines;
}

/** Merge changed spans within 2×CONTEXT_LINES of each other into a single hunk. */
function groupIntoHunks(changedIndexes: number[], totalLines: number): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];

  for (const index of changedIndexes) {
    const start = Math.max(0, index - CONTEXT_LINES);
    const end = Math.min(totalLines - 1, index + CONTEXT_LINES);
    const last = ranges[ranges.length - 1];

    if (last && start <= last[1] + 1) {
      last[1] = Math.max(last[1], end);
    } else {
      ranges.push([start, end]);
    }
  }

  return ranges;
}

function appendHunk(out: string[], lines: Line[], start: number, end: number): void {
  const first = lines[start];
  if (!first) return;

  let oldCount = 0;
  let newCount = 0;
  for (let i = start; i <= end; i++) {
    const line = lines[i];
    if (!line) continue;
    if (line.type !== "inserted") oldCount++;
    if (line.type !== "deleted") newCount++;
  }

  out.push(`@@ -${first.oldLineNo},${oldCount} +${first.newLineNo},${newCount} @@\n`);

  for (let i = start; i <= end; i++) {
    const line = lines[i];
    if (!line) continue;
    const prefix = line.type === "deleted" ? "-" : line.type === "inserted" ? "+" : " ";
    out.push(`${prefix}${line.text}\n`);
  }
}

/** Returns an empty string when the two texts are identical. */
export function createUnifiedDiff(oldText: string, newText: string, relativePath: string): string {
  const lines = toSequentialLines(trimTrailingNewline(oldText), trimTrailingNewline(newText));

  const changedIndexes: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]?.type !== "unchanged") changedIndexes.push(i);
  }

  if (changedIndexes.length === 0) return "";

  const out: string[] = [`--- a/${relativePath}\n`, `+++ b/${relativePath}\n`];
  for (const [start, end] of groupIntoHunks(changedIndexes, lines.length)) {
    appendHunk(out, lines, start, end);
  }

  return out.join("");
}

/**
 * Content can carry CRLF from earlier Windows-authored uploads while the browser editor yields LF.
 * Diffing across mismatched EOL styles flags unrelated context lines as changed, and GNU patch then
 * rejects the hunk with "different line endings" even though the intended edit applies cleanly.
 */
export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
