namespace Shared.Dto;

public class PageRawDto
{
    public string Path { get; set; } = string.Empty;
    public string RawContent { get; set; } = string.Empty;
    public bool Found { get; set; } = true;
}

public class PagePreviewRequestDto
{
    public string Markdown { get; set; } = string.Empty;
}

public class PagePreviewResultDto
{
    public string Html { get; set; } = string.Empty;
}
