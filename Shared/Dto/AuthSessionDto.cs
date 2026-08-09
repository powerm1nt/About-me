using System.Text.Json.Serialization;

namespace Shared.Dto;

public class AuthUserDto
{
    [JsonPropertyName("login")]
    public string Login { get; set; } = string.Empty;

    [JsonPropertyName("avatarUrl")]
    public string AvatarUrl { get; set; } = string.Empty;

    // GitHub's display name; empty if the user hasn't set one, in which case Login is the fallback.
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;
}
