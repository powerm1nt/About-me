namespace Shared.Dto;

public class PageDto
{
    public string Path { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public string RenderedHtml { get; set; } = string.Empty;
    public string ContentType { get; set; } = "text/markdown";
    public bool Found { get; set; } = true;
    public PageMetaDto Meta { get; set; } = new();
}

public class PageMetaDto
{
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Author { get; set; } = "Emi (powerm1nt)";
    public string LastEdited { get; set; } = string.Empty;
}
