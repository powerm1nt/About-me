using System.Text.Json.Serialization;

namespace Shared.Dto;

public class AuthUserDto
{
    [JsonPropertyName("login")]
    public string Login { get; set; } = string.Empty;

    [JsonPropertyName("avatarUrl")]
    public string AvatarUrl { get; set; } = string.Empty;
}
