using System.Text.Json.Serialization;

namespace Shared.Dto;

public class ArticleMetadataDto
{
    [JsonPropertyName("filePath")]
    public string FilePath { get; set; } = string.Empty;

    [JsonPropertyName("title")]
    public string Title { get; set; } = string.Empty;

    [JsonPropertyName("description")]
    public string Description { get; set; } = string.Empty;

    [JsonPropertyName("author")]
    public string Author { get; set; } = string.Empty;

    [JsonPropertyName("lastEdited")]
    public string LastEdited { get; set; } = string.Empty;

    [JsonPropertyName("lastEditedIso")]
    public string LastEditedIso { get; set; } = string.Empty;

    [JsonPropertyName("created")]
    public string Created { get; set; } = string.Empty;

    // Removed: Slug, Summary, PublishedAt, Tags — not present in articles-metadata.json
}
