namespace Web.Services;

// Parses the unified-diff text produced by Server's DiffService back into hunks for display.
public static class UnifiedDiffParser
{
    public static List<DiffHunk> Parse(string patchText)
    {
        var hunks = new List<DiffHunk>();
        DiffHunk? current = null;

        foreach (var rawLine in patchText.Replace("\r\n", "\n").Split('\n'))
        {
            if (rawLine.StartsWith("---", StringComparison.Ordinal) || rawLine.StartsWith("+++", StringComparison.Ordinal))
                continue;

            if (rawLine.StartsWith("@@", StringComparison.Ordinal))
            {
                current = new DiffHunk { Header = rawLine };
                hunks.Add(current);
                continue;
            }

            if (current is null) continue;

            if (rawLine.StartsWith("+", StringComparison.Ordinal))
                current.Lines.Add(new DiffLine { Type = DiffLineType.Added, Text = rawLine[1..] });
            else if (rawLine.StartsWith("-", StringComparison.Ordinal))
                current.Lines.Add(new DiffLine { Type = DiffLineType.Removed, Text = rawLine[1..] });
            else if (rawLine.StartsWith(" ", StringComparison.Ordinal))
                current.Lines.Add(new DiffLine { Type = DiffLineType.Context, Text = rawLine[1..] });
            // any other line (e.g. the trailing empty element from the final split) is ignored
        }

        return hunks;
    }
}
