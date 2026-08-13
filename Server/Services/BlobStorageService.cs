using Azure.Storage;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Microsoft.Extensions.Options;
using Shared.Config;

namespace Server.Services;

public class BlobStorageService
{
    private readonly BlobContainerClient _container;
    private readonly BlobStorageConfig _config;

    public string ContainerBaseUrl => _config.BaseUrl;

    public BlobStorageService(IOptions<BlobStorageConfig> config)
    {
        _config = config.Value;
        var credential = new StorageSharedKeyCredential(_config.AccountName, _config.AccountKey);
        var serviceClient = new BlobServiceClient(new Uri(_config.ServiceUrl), credential);
        _container = serviceClient.GetBlobContainerClient(_config.ContainerName);
    }

    public async Task<string?> GetTextAsync(string path)
    {
        var (content, _) = await GetTextWithMetadataAsync(path);
        return content;
    }

    // Same as GetTextAsync, but also returns the blob's actual last-modified timestamp, the
    // authoritative "last edited" date. It can't be spoofed via a lastEdited: field in the
    // markdown's own frontmatter the way GetTextAsync's plain content can.
    public async Task<(string? Content, DateTimeOffset? LastModified)> GetTextWithMetadataAsync(string path)
    {
        foreach (var candidate in Candidates(path))
        {
            var blob = _container.GetBlobClient(candidate.TrimStart('/'));
            try
            {
                BlobDownloadResult result = await blob.DownloadContentAsync();
                return (result.Content.ToString(), result.Details.LastModified);
            }
            catch (Azure.RequestFailedException ex) when (ex.Status == 404) { }
        }

        return (null, null);
    }

    // List all blob names under an optional prefix (e.g. "blog/"). BlobStates.None restricts this
    // to live blobs only, if the account has soft-delete enabled, so BlobStates.All would also
    // surface soft-deleted copies of overwritten/re-uploaded blobs as duplicate entries.
    public async IAsyncEnumerable<string> ListBlobsAsync(string prefix = "")
    {
        await foreach (var item in _container.GetBlobsAsync(BlobTraits.None, BlobStates.None, prefix, CancellationToken.None))
            if (item.Properties.AccessTier == AccessTier.Hot)
                yield return item.Name;
    }

    // If the caller asks for .md, also try .mdx
    private static IEnumerable<string> Candidates(string path)
    {
        yield return path;

        if (path.EndsWith(".md", StringComparison.OrdinalIgnoreCase) &&
            !path.EndsWith(".ja.md", StringComparison.OrdinalIgnoreCase))
            yield return path + "x";                          // README.md  → README.mdx

        if (path.EndsWith(".ja.md", StringComparison.OrdinalIgnoreCase))
            yield return path[..^3] + ".mdx";                // foo.ja.md  → foo.ja.mdx
    }
}
