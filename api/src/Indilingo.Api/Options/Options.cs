namespace Indilingo.Api.Options;

public sealed class JwtOptions
{
    public const string Section = "Jwt";
    public string Issuer { get; set; } = "indilingo";
    public string Audience { get; set; } = "indilingo";
    public string SigningKey { get; set; } = "";
    public int AccessTokenMinutes { get; set; } = 15;
    public int RefreshTokenDays { get; set; } = 60;
}

public sealed class AppOptions
{
    public const string Section = "App";
    /// <summary>Public address of the web app. Links in emails point here.</summary>
    public string WebBaseUrl { get; set; } = "http://localhost:4200";
    /// <summary>Origins allowed to call the API and to receive social sign-in redirects.</summary>
    public string[] AllowedOrigins { get; set; } = [];
    public int InviteDays { get; set; } = 7;
}

public sealed class BrevoOptions
{
    public const string Section = "Brevo";
    public string ApiKey { get; set; } = "";
    public string SenderEmail { get; set; } = "";
    public string SenderName { get; set; } = "Indilingo";
    public bool IsConfigured => !string.IsNullOrWhiteSpace(ApiKey) && !string.IsNullOrWhiteSpace(SenderEmail);
}

public sealed class BootstrapOptions
{
    public const string Section = "Bootstrap";
    /// <summary>When no admin exists yet, an admin invitation is sent to this address at startup.</summary>
    public string AdminEmail { get; set; } = "";
}
