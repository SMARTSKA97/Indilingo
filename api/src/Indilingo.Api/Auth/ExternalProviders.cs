using Indilingo.Api.Data;
using Indilingo.Api.Options;
using Microsoft.AspNetCore.Identity;

namespace Indilingo.Api.Auth;

/// <summary>Social sign-in providers. The ids are what the web app sees; schemes are the ASP.NET names.</summary>
public static class ExternalProviders
{
    public static readonly IReadOnlyDictionary<string, string> Schemes = new Dictionary<string, string>
    {
        ["google"] = "Google",
        ["facebook"] = "Facebook",
        ["microsoft"] = "Microsoft",
        ["github"] = "GitHub",
    };

    /// <summary>Providers whose email addresses are verified, so a matching existing account may be linked.</summary>
    private static readonly HashSet<string> VerifiedEmailSchemes = ["Google", "Microsoft"];

    public static bool IsConfigured(IConfiguration config, string id) =>
        !string.IsNullOrWhiteSpace(config[$"Auth:{Schemes[id]}:ClientId"]) &&
        !string.IsNullOrWhiteSpace(config[$"Auth:{Schemes[id]}:ClientSecret"]);

    public static IReadOnlyList<string> Enabled(IConfiguration config) =>
        Schemes.Keys.Where(id => IsConfigured(config, id)).ToList();

    public static bool TryGetScheme(IConfiguration config, string id, out string scheme)
    {
        scheme = "";
        if (!Schemes.TryGetValue(id.ToLowerInvariant(), out var found) || !IsConfigured(config, id.ToLowerInvariant()))
        {
            return false;
        }
        scheme = found;
        return true;
    }

    public static bool IsAllowedReturnUrl(string? returnUrl, AppOptions app)
    {
        if (!Uri.TryCreate(returnUrl, UriKind.Absolute, out var uri)) return false;
        var origin = uri.GetLeftPart(UriPartial.Authority);
        return app.AllowedOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase);
    }

    public static bool TrustsEmail(string scheme) => VerifiedEmailSchemes.Contains(scheme);
}

public sealed record ExternalResult(AppUser? User, string? Error)
{
    public static ExternalResult Ok(AppUser user) => new(user, null);
    public static ExternalResult Fail(string code) => new(null, code);
}

/// <summary>Finds, links or creates the local account for a social sign-in.</summary>
public sealed class ExternalLoginService(UserManager<AppUser> users, AppDbContext db, TimeProvider clock)
{
    public async Task<ExternalResult> ResolveAsync(
        string scheme, string providerKey, string? email, string? name, CancellationToken ct)
    {
        var linked = await users.FindByLoginAsync(scheme, providerKey);
        if (linked is not null) return await CheckAsync(linked);

        if (!Services.Validation.IsValidEmail(email)) return ExternalResult.Fail("email_required");
        var address = email!.Trim();

        var existing = await users.FindByEmailAsync(address);
        if (existing is not null)
        {
            // Never attach a social login to a privileged account, or to any account when the
            // provider does not prove the email belongs to the person signing in.
            var roles = await users.GetRolesAsync(existing);
            if (roles.Any(Roles.IsPrivileged) || !ExternalProviders.TrustsEmail(scheme))
            {
                return ExternalResult.Fail("account_exists");
            }
            var check = await CheckAsync(existing);
            if (check.User is null) return check;

            var add = await users.AddLoginAsync(existing, new UserLoginInfo(scheme, providerKey, scheme));
            if (!add.Succeeded) return ExternalResult.Fail("external_failed");
            if (!existing.EmailConfirmed)
            {
                existing.EmailConfirmed = true;
                await users.UpdateAsync(existing);
            }
            return ExternalResult.Ok(existing);
        }

        var now = clock.GetUtcNow();
        var user = new AppUser
        {
            UserName = address,
            Email = address,
            EmailConfirmed = ExternalProviders.TrustsEmail(scheme),
            CreatedAt = now,
        };
        var created = await users.CreateAsync(user);
        if (!created.Succeeded) return ExternalResult.Fail("external_failed");
        await users.AddToRoleAsync(user, Roles.Learner);
        await users.AddLoginAsync(user, new UserLoginInfo(scheme, providerKey, scheme));

        var display = string.IsNullOrWhiteSpace(name) ? address.Split('@')[0] : name.Trim();
        db.Profiles.Add(new UserProfile
        {
            UserId = user.Id,
            DisplayName = display.Length > 40 ? display[..40] : display,
            UpdatedAt = now,
        });
        await db.SaveChangesAsync(ct);
        return ExternalResult.Ok(user);
    }

    private async Task<ExternalResult> CheckAsync(AppUser user)
    {
        if (await users.IsLockedOutAsync(user)) return ExternalResult.Fail("locked_out");
        // A social sign-in must not skip the second step.
        if (user.TwoFactorEnabled) return ExternalResult.Fail("two_factor_required");
        return ExternalResult.Ok(user);
    }
}
