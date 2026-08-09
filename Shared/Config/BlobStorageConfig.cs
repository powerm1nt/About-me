namespace Shared.Config;

public class BlobStorageConfig
{
    public const string SectionName = "BlobStorage";

    public string AccountName { get; set; } = string.Empty;
    public string ContainerName { get; set; } = string.Empty;
    public string AccountKey { get; set; } = string.Empty;

    /// <summary>Optional CDN (Azure Front Door) endpoint, e.g. "https://nwrks-cdn-ebfnb4hdfdc3bag9.z02.azurefd.net". When set, public asset URLs are served through the CDN instead of directly from blob storage.</summary>
    public string CdnBaseUrl { get; set; } = string.Empty;

    public string ServiceUrl => $"https://{AccountName}.blob.core.windows.net";

    public string BaseUrl => string.IsNullOrWhiteSpace(CdnBaseUrl)
        ? $"https://{AccountName}.blob.core.windows.net/{ContainerName}"
        : $"{CdnBaseUrl.TrimEnd('/')}/{ContainerName}";
}
