namespace Web.Services;

public record PendingLink(string Url, string Label);

/// <summary>Shared singleton that queues an outbound link for confirmation via AppModal.</summary>
public class ExternalLinkState
{
    public PendingLink? Pending { get; private set; }

    public event Action<PendingLink?>? OnChange;

    public void Request(string url, string label)
    {
        Pending = new PendingLink(url, label);
        OnChange?.Invoke(Pending);
    }

    public void Clear()
    {
        Pending = null;
        OnChange?.Invoke(null);
    }
}
