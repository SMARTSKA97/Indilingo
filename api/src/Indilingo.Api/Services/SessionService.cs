using Indilingo.Api.Contracts;
using Indilingo.Api.Data;
using Indilingo.Api.Options;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Indilingo.Api.Services;

/// <summary>Builds the sign-in response the clients expect: user, access token and refresh token.</summary>
public sealed class SessionService(
    UserManager<AppUser> users,
    AppDbContext db,
    TokenService tokens,
    IOptions<JwtOptions> jwt)
{
    public async Task<AuthResponse> StartSessionAsync(AppUser user, CancellationToken ct, string? refreshToken = null)
    {
        var dto = await ToUserDtoAsync(user, ct);
        var access = tokens.CreateAccessToken(user, dto.DisplayName, dto.Roles);
        refreshToken ??= await tokens.IssueRefreshTokenAsync(user.Id, ct);
        return new AuthResponse(access, refreshToken, jwt.Value.AccessTokenMinutes * 60, dto);
    }

    public async Task<UserDto> ToUserDtoAsync(AppUser user, CancellationToken ct)
    {
        var roles = (await users.GetRolesAsync(user)).OrderBy(r => r, StringComparer.Ordinal).ToList();
        var profile = await db.Profiles.AsNoTracking().FirstOrDefaultAsync(p => p.UserId == user.Id, ct);
        var name = profile?.DisplayName;
        if (string.IsNullOrWhiteSpace(name))
        {
            name = user.Email is { Length: > 0 } e ? e.Split('@')[0] : "Learner";
        }
        return new UserDto(user.Id, user.Email, name, roles, user.IsGuest, user.TwoFactorEnabled);
    }
}
