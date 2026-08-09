using Markdig;
using Microsoft.AspNetCore.Mvc;
using Server.Services;
using Shared.Dto;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Server.Controllers;

[ApiController]
[Route("api/pages")]
public class PagesController : ControllerBase
{
    private readonly BlobStorageService _blob;

    private static readonly MarkdownPipeline Pipeline = new MarkdownPipelineBuilder()
        .UseAdvancedExtensions()
        .Build();

    public PagesController(BlobStorageService blob)
    {
        _blob = blob;
    }

    // GET /api/pages?path=README.md
    [HttpGet]
    public async Task<ActionResult<PageDto>> GetPage([FromQuery] string path = "README.md")
    {
        var normalizedPath = NormalizePath(path);
        var rawText = await _blob.GetTextAsync(normalizedPath);

        if (rawText is null)
            return NotFound(new { error = $"Page '{normalizedPath}' not found." });

        var (meta, html) = RenderRawText(rawText);
        var (_, markdown) = ParseFrontmatter(rawText);

        return Ok(new PageDto
        {
            Path = normalizedPath,
            Content = markdown,
            RenderedHtml = html,
            ContentType = "text/markdown",
            Found = true,
            Meta = meta
        });
    }

    // GET /api/pages/raw?path=blog/welcome.md — byte-for-byte blob content (frontmatter included),
    // used by the editor so proposed diffs are generated against the exact source the patch will target.
    [HttpGet("raw")]
    public async Task<ActionResult<PageRawDto>> GetRawPage([FromQuery] string path)
    {
        var normalizedPath = NormalizePath(path);
        var rawText = await _blob.GetTextAsync(normalizedPath);

        if (rawText is null)
            return NotFound(new { error = $"Page '{normalizedPath}' not found." });

        return Ok(new PageRawDto
        {
            Path = normalizedPath,
            RawContent = rawText,
            Found = true
        });
    }

    // POST /api/pages/preview — renders arbitrary raw markdown (frontmatter + body) through the
    // same pipeline as GetPage, so the editor's Preview tab matches the live page exactly.
    [HttpPost("preview")]
    public ActionResult<PagePreviewResultDto> PreviewPage([FromBody] PagePreviewRequestDto request)
    {
        var (_, html) = RenderRawText(request.Markdown ?? string.Empty);
        return Ok(new PagePreviewResultDto { Html = html });
    }

    private (PageMetaDto meta, string html) RenderRawText(string rawText)
    {
        var (meta, markdown) = ParseFrontmatter(rawText);
        var preprocessed = InjectComponentSentinels(markdown);
        var html = Markdown.ToHtml(preprocessed, Pipeline);
        html = RewriteAssetPaths(html, _blob.ContainerBaseUrl);
        return (meta, html);
    }

    // GET /api/pages/articles
    [HttpGet("articles")]
    public async Task<ActionResult<List<ArticleMetadataDto>>> GetArticles()
    {
        var articles = new List<ArticleMetadataDto>();

        await foreach (var blobName in _blob.ListBlobsAsync("blog/"))
        {
            // Only process .md / .mdx files; skip index files
            if (!blobName.EndsWith(".md", StringComparison.OrdinalIgnoreCase) &&
                !blobName.EndsWith(".mdx", StringComparison.OrdinalIgnoreCase))
                continue;

            var filePath = NormalizePath(blobName);

            if (filePath == "blog/index.md" || filePath == "blog/index.ja.md")
                continue;

            var text = await _blob.GetTextAsync(blobName);
            if (text is null) continue;

            var (meta, _) = ParseFrontmatter(text);

            articles.Add(new ArticleMetadataDto
            {
                FilePath    = filePath,
                Title       = string.IsNullOrEmpty(meta.Title) ? System.IO.Path.GetFileNameWithoutExtension(filePath) : meta.Title,
                Description = meta.Description,
                Author      = meta.Author,
                LastEdited  = meta.LastEdited,
            });
        }

        // Sort: EN articles first within each group, then by title
        articles.Sort((a, b) => string.Compare(a.FilePath, b.FilePath, StringComparison.Ordinal));

        return Ok(articles);
    }

    private static string NormalizePath(string path) =>
        Regex.Replace(path, @"\.mdx$", ".md");

    private static readonly MarkdownPipeline InnerPipeline = new MarkdownPipelineBuilder()
        .UseAdvancedExtensions()
        .Build();

    // Supported custom components in markdown and their sentinel type names
    private static readonly Dictionary<string, string> ComponentTags = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Info"]    = "info",
        ["Warning"] = "warning",
        ["Tip"]     = "tip",
        ["Danger"]  = "danger",
    };

    // Self-closing components (no body): <BlogIndex /> → sentinel with empty content
    private static readonly string[] SelfClosingTags = ["BlogIndex"];

    private static string InjectComponentSentinels(string markdown)
    {
        // Self-closing components: <BlogIndex /> or <BlogIndex/>
        foreach (var tag in SelfClosingTags)
        {
            var type = tag.ToLowerInvariant().Replace("index", "-index");
            markdown = Regex.Replace(
                markdown,
                $@"<{tag}\s*/?>",
                $"<!--md-component:{type}:--><!--/md-component-->",
                RegexOptions.IgnoreCase);
        }

        // Block components with optional title attr and inner body
        foreach (var (tag, type) in ComponentTags)
        {
            markdown = Regex.Replace(
                markdown,
                $@"<{tag}(?:\s+title=""([^""]*)"")?\s*>([\s\S]*?)</{tag}>",
                m =>
                {
                    var title    = m.Groups[1].Success ? m.Groups[1].Value : string.Empty;
                    var body     = m.Groups[2].Success ? m.Groups[2].Value.Trim() : string.Empty;
                    var innerHtml = string.IsNullOrEmpty(body)
                        ? string.Empty
                        : Markdown.ToHtml(body, InnerPipeline).Trim();
                    return $"<!--md-component:{type}:{title}-->{innerHtml}<!--/md-component-->";
                },
                RegexOptions.IgnoreCase);
        }
        return markdown;
    }

    // Rewrite asset paths in rendered HTML so they resolve straight to the CDN/blob container.
    // - src="public/foo.jpg" → src="https://nwrks-cdn.public.prod.nuka.works/static/foo.jpg"
    // - href="./blog/foo.mdx" → href="/blog/foo"
    private static string RewriteAssetPaths(string html, string assetBase)
    {
        html = Regex.Replace(html, @"src=""public/([^""]+)""",
            m => $"src=\"{assetBase}/{m.Groups[1].Value}\"");

        // href="./blog/slug.mdx" → href="/blog/slug" or "/blog/slug/ja"
        html = Regex.Replace(html, @"href=""\./(blog/[^""]+\.(?:mdx?))""", m =>
        {
            var filePath = m.Groups[1].Value;
            var isJa = filePath.EndsWith(".ja.md") || filePath.EndsWith(".ja.mdx");
            var name = filePath["blog/".Length..];
            name = Regex.Replace(name, @"\.ja\.mdx?$", string.Empty);
            name = Regex.Replace(name, @"\.mdx?$", string.Empty);
            var route = isJa ? $"/blog/{name}/ja" : $"/blog/{name}";
            return $"href=\"{route}\"";
        });

        // Inject onerror on every <img> tag so broken images show an error placeholder.
        // Adds class "img-error" and replaces src with a transparent 1×1 px data URI.
        const string errorHandler =
            "this.onerror=null;" +
            "this.classList.add('img-error');" +
            "this.removeAttribute('srcset');" +
            "this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22/%3E';";

        html = Regex.Replace(html, @"<img\b", $"<img onerror=\"{errorHandler}\"");

        return html;
    }

    private static (PageMetaDto meta, string content) ParseFrontmatter(string text)
    {
        var match = Regex.Match(text, @"^---\r?\n([\s\S]*?)\r?\n---\r?\n?");
        if (!match.Success)
            return (new PageMetaDto(), text);

        var yaml = match.Groups[1].Value;
        var content = text[match.Length..];
        var data = new Dictionary<string, string>();

        foreach (var line in yaml.Split('\n'))
        {
            var colon = line.IndexOf(':');
            if (colon < 0) continue;
            var key = line[..colon].Trim();
            var val = line[(colon + 1)..].Trim().Trim('"', '\'');
            data[key] = val;
        }

        var meta = new PageMetaDto
        {
            Title = data.GetValueOrDefault("title", string.Empty),
            Description = data.GetValueOrDefault("description", string.Empty),
            Author = data.GetValueOrDefault("author", "Emi (powerm1nt)"),
            LastEdited = data.GetValueOrDefault("lastEdited", string.Empty),
        };

        return (meta, content);
    }
}
