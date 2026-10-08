using Indilingo.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;

namespace Indilingo.Api.Auth;

public static class Policies
{
    /// <summary>Admin tools: the caller must be an Admin who has turned on two-factor sign-in.</summary>
    public const string AdminTwoFactor = "AdminTwoFactor";
}

public sealed class AdminWithTwoFactorRequirement : IAuthorizationRequirement;

/// <summary>
/// Checks the database rather than the token, so an admin who has just turned on two-factor
/// does not have to sign in again, and one who turned it off loses access at once.
/// </summary>
public sealed class AdminWithTwoFactorHandler(UserManager<AppUser> users)
    : AuthorizationHandler<AdminWithTwoFactorRequirement>
{
    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext context, AdminWithTwoFactorRequirement requirement)
    {
        if (!Guid.TryParse(context.User.FindFirst("sub")?.Value, out var id)) return;
        var user = await users.FindByIdAsync(id.ToString());
        if (user is null || !user.TwoFactorEnabled) return;
        if (await users.IsLockedOutAsync(user)) return;
        if (await users.IsInRoleAsync(user, Roles.Admin)) context.Succeed(requirement);
    }
}
