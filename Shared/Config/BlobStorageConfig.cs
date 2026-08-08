namespace Shared.Config;

public class BlobStorageConfig
{
    public const string SectionName = "BlobStorage";

    public string AccountName { get; set; } = string.Empty;
    public string ContainerName { get; set; } = string.Empty;
    public string AccountKey { get; set; } = string.Empty;

    public string ServiceUrl => $"https://{AccountName}.blob.core.windows.net";
    public string BaseUrl => $"https://{AccountName}.blob.core.windows.net/{ContainerName}";
}
