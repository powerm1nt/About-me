using System.Text;
using DiffPlex.DiffBuilder;
using DiffPlex.DiffBuilder.Model;

namespace Server.Services;

// Produces a classic unified-diff (the text format GNU `patch` consumes) between two full file
// contents. DiffPlex's InlineDiffBuilder gives a flat, in-order list of unchanged/deleted/inserted
// lines; this groups the changed spans into unified-diff hunks with surrounding context lines and
// standard `@@ -oldStart,oldCount +newStart,newCount @@` headers.
public class DiffService
{
    private const int ContextLines = 3;

    private record Line(ChangeType Type, string Text, int OldLineNo, int NewLineNo);

    // Returns empty string if the two texts are identical.
    public string CreateUnifiedDiff(string oldText, string newText, string relativePath)
    {
        // Splitting "...last line\n" by '\n' yields a phantom empty trailing element that doesn't
        // correspond to a real line in the file. Left in, it becomes a spurious final context line
        // that never lines up with the real file, forcing `patch` to fall back to fuzzy matching.
        var model = InlineDiffBuilder.Diff(TrimTrailingNewline(oldText), TrimTrailingNewline(newText));
        var lines = ToSequentialLines(model);

        var changedIndexes = new List<int>();
        for (var i = 0; i < lines.Count; i++)
            if (lines[i].Type != ChangeType.Unchanged)
                changedIndexes.Add(i);

        if (changedIndexes.Count == 0)
            return string.Empty;

        var hunkRanges = GroupIntoHunks(changedIndexes, lines.Count);

        var sb = new StringBuilder();
        sb.Append($"--- a/{relativePath}\n");
        sb.Append($"+++ b/{relativePath}\n");

        foreach (var (start, end) in hunkRanges)
            AppendHunk(sb, lines, start, end);

        return sb.ToString();
    }

    private static List<Line> ToSequentialLines(DiffPaneModel model)
    {
        var lines = new List<Line>(model.Lines.Count);
        var oldLineNo = 1;
        var newLineNo = 1;

        foreach (var piece in model.Lines)
        {
            var text = piece.Text ?? string.Empty;
            switch (piece.Type)
            {
                case ChangeType.Deleted:
                    lines.Add(new Line(ChangeType.Deleted, text, oldLineNo, newLineNo));
                    oldLineNo++;
                    break;
                case ChangeType.Inserted:
                    lines.Add(new Line(ChangeType.Inserted, text, oldLineNo, newLineNo));
                    newLineNo++;
                    break;
                default: // Unchanged (Modified/Imaginary don't occur at InlineDiffBuilder's line granularity)
                    lines.Add(new Line(ChangeType.Unchanged, text, oldLineNo, newLineNo));
                    oldLineNo++;
                    newLineNo++;
                    break;
            }
        }

        return lines;
    }

    // Merge changed spans that are within 2*ContextLines of each other into a single hunk.
    private static List<(int start, int end)> GroupIntoHunks(List<int> changedIndexes, int totalLines)
    {
        var ranges = new List<(int start, int end)>();

        foreach (var index in changedIndexes)
        {
            var start = Math.Max(0, index - ContextLines);
            var end = Math.Min(totalLines - 1, index + ContextLines);

            if (ranges.Count > 0 && start <= ranges[^1].end + 1)
                ranges[^1] = (ranges[^1].start, Math.Max(ranges[^1].end, end));
            else
                ranges.Add((start, end));
        }

        return ranges;
    }

    private static void AppendHunk(StringBuilder sb, List<Line> lines, int start, int end)
    {
        var first = lines[start];
        var oldCount = 0;
        var newCount = 0;

        for (var i = start; i <= end; i++)
        {
            if (lines[i].Type != ChangeType.Inserted) oldCount++;
            if (lines[i].Type != ChangeType.Deleted) newCount++;
        }

        sb.Append($"@@ -{first.OldLineNo},{oldCount} +{first.NewLineNo},{newCount} @@\n");

        for (var i = start; i <= end; i++)
        {
            var prefix = lines[i].Type switch
            {
                ChangeType.Deleted => '-',
                ChangeType.Inserted => '+',
                _ => ' '
            };
            sb.Append(prefix).Append(lines[i].Text).Append('\n');
        }
    }

    private static string TrimTrailingNewline(string text)
    {
        if (text.EndsWith("\r\n", StringComparison.Ordinal)) return text[..^2];
        if (text.EndsWith("\n", StringComparison.Ordinal)) return text[..^1];
        return text;
    }
}
