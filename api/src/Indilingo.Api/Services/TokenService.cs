using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Indilingo.Api.Data;
using Indilingo.Api.Options;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Indilingo.Api.Services;

public sealed record RotationResult(Guid? UserId, string? RefreshToken)
{
    public static readonly RotationResult Invalid = new(null, null);
    public bool Succeeded => UserId is not null;
}

/// <summary>Creates short-lived JWT access tokens and long-lived opaque refresh tokens.</summary>
public sealed class TokenService(IOptions<JwtOptions> options, AppDbContext db, TimeProvider clock)
{
    private static readonly TimeSpan ReuseGrace = TimeSpan.FromSeconds(30);
    private readonly JwtOptions jwt = options.Value;

    public string CreateAccessToken(AppUser user, string displayName, IEnumerable<string> roles)
    {
        var now = clock.GetUtcNow();
        var claims = new List<Claim>
        {
            new("sub", user.Id.ToString()),
            new("jti", Guid.NewGuid().ToString("N")),
            new("name", displayName),
        };
        if (!string.IsNullOrEmpty(user.Email)) claims.Add(new Claim("email", user.Email));
        if (user.IsGuest) claims.Add(new Claim("guest", "true"));
        claims.AddRange(roles.Select(r => new Claim("role", r)));

        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = jwt.Issuer,
            Audience = jwt.Audience,
            Subject = new ClaimsIdentity(claims),
            NotBefore = now.UtcDateTime,
            Expires = now.AddMinutes(jwt.AccessTokenMinutes).UtcDateTime,
            SigningCredentials = new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.SigningKey)),
                SecurityAlgorithms.HmacSha256),
        };
        return new JsonWebTokenHandler().CreateToken(descriptor);
    }

    public async Task<string> IssueRefreshTokenAsync(Guid userId, CancellationToken ct)
    {
        var (raw, row) = NewRefreshToken(userId, clock.GetUtcNow());
        db.RefreshTokens.Add(row);
        await db.SaveChangesAsync(ct);
        return raw;
    }

    /// <summary>Swaps a valid refresh token for a new one. A token that was already used is treated as stolen.</summary>
    public async Task<RotationResult> RotateAsync(string rawToken, CancellationToken ct)
    {
        var hash = Hash(rawToken);
        var row = await db.RefreshTokens.FirstOrDefaultAsync(t => t.TokenHash == hash, ct);
        if (row is null) return RotationResult.Invalid;

        var now = clock.GetUtcNow();
        if (row.RevokedAt is not null)
        {
            // A client may retry with the old token if the response was lost; only a late reuse looks like theft.
            if (now - row.RevokedAt.Value > ReuseGrace) await RevokeAllAsync(row.UserId, ct);
            return RotationResult.Invalid;
        }
        if (row.ExpiresAt <= now) return RotationResult.Invalid;

        var (raw, next) = NewRefreshToken(row.UserId, now);
        row.RevokedAt = now;
        row.ReplacedBy = next.Id;
        db.RefreshTokens.Add(next);
        await db.SaveChangesAsync(ct);
        return new RotationResult(row.UserId, raw);
    }

    public async Task RevokeAsync(string rawToken, CancellationToken ct)
    {
        var hash = Hash(rawToken);
        var row = await db.RefreshTokens.FirstOrDefaultAsync(t => t.TokenHash == hash && t.RevokedAt == null, ct);
        if (row is null) return;
        row.RevokedAt = clock.GetUtcNow();
        await db.SaveChangesAsync(ct);
    }

    public async Task RevokeAllAsync(Guid userId, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var open = await db.RefreshTokens.Where(t => t.UserId == userId && t.RevokedAt == null).ToListAsync(ct);
        foreach (var t in open) t.RevokedAt = now;
        await db.SaveChangesAsync(ct);
    }

    public static string Hash(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();

    public static string NewSecret() => Base64Url(RandomNumberGenerator.GetBytes(32));

    private (string Raw, RefreshToken Row) NewRefreshToken(Guid userId, DateTimeOffset now)
    {
        var raw = NewSecret();
        var row = new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            TokenHash = Hash(raw),
            CreatedAt = now,
            ExpiresAt = now.AddDays(jwt.RefreshTokenDays),
        };
        return (raw, row);
    }

    private static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
