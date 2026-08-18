/**
 * A classic unified diff, the format GNU `patch` consumes.
 *
 * Assembled by hand rather than with jsdiff's `createPatch`, which emits an `Index:`/`===` preamble
 * instead of the bare `--- a/<path>` / `+++ b/<path>` form that everything already in `patches/`
 * and the workflows consuming them expect. jsdiff still supplies the line-level diff.
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
 * Splitting on '\n' leaves a phantom trailing element. Left in, it becomes a bogus final context
 * line and forces `patch` into fuzzy matching.
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
 * Stored content can carry CRLF while the editor yields LF. Diffing across the two marks unrelated
 * context lines as changed, and patch then rejects the hunk over line endings.
 */
export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
