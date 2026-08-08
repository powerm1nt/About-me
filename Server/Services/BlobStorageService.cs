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

    public async Task<(Stream? Content, string ContentType, bool Found)> GetFileAsync(string path)
    {
        foreach (var candidate in Candidates(path))
        {
            var blob = _container.GetBlobClient(candidate.TrimStart('/'));
            try
            {
                BlobDownloadStreamingResult result = await blob.DownloadStreamingAsync();
                var contentType = result.Details.ContentType ?? "application/octet-stream";
                return (result.Content, contentType, true);
            }
            catch (Azure.RequestFailedException ex) when (ex.Status == 404) { }
        }

        return (null, string.Empty, false);
    }

    public async Task<string?> GetTextAsync(string path)
    {
        foreach (var candidate in Candidates(path))
        {
            var blob = _container.GetBlobClient(candidate.TrimStart('/'));
            try
            {
                BlobDownloadResult result = await blob.DownloadContentAsync();
                return result.Content.ToString();
            }
            catch (Azure.RequestFailedException ex) when (ex.Status == 404) { }
        }

        return null;
    }

    // List all blob names under an optional prefix (e.g. "blog/")
    public async IAsyncEnumerable<string> ListBlobsAsync(string prefix = "")
    {
        await foreach (var item in _container.GetBlobsAsync(BlobTraits.None, BlobStates.All, prefix, CancellationToken.None))
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
