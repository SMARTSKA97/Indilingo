using Microsoft.AspNetCore.Identity;

namespace Indilingo.Api.Data;

public static class Roles
{
    public const string Learner = "Learner";
    public const string Reviewer = "Reviewer";
    public const string Admin = "Admin";

    public static readonly string[] Invitable = [Reviewer, Admin];
    public static bool IsPrivileged(string role) => role is Reviewer or Admin;
}

public class AppUser : IdentityUser<Guid>
{
    public bool IsGuest { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public class AppRole : IdentityRole<Guid>
{
}

public class UserProfile
{
    public Guid UserId { get; set; }
    public string DisplayName { get; set; } = "";
    public string? CountryCode { get; set; }
    public short? BirthYear { get; set; }
    public string? LearnerProfile { get; set; }
    public string? TimeZone { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public class RefreshToken
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    /// <summary>SHA-256 of the token, lowercase hex. The token itself is never stored.</summary>
    public string TokenHash { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
    public Guid? ReplacedBy { get; set; }
}

public class Invite
{
    public Guid Id { get; set; }
    public string Email { get; set; } = "";
    public string RoleName { get; set; } = "";
    public string TokenHash { get; set; } = "";
    public Guid? CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? AcceptedAt { get; set; }
}
