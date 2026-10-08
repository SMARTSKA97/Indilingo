using System.Security.Claims;
using Indilingo.Api.Auth;
using Indilingo.Api.Contracts;
using Indilingo.Api.Data;
using Indilingo.Api.Options;
using Indilingo.Api.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using static Indilingo.Api.Endpoints.ApiResults;

namespace Indilingo.Api.Endpoints;

public static class AuthEndpoints
{
    public static void MapAuth(this IEndpointRouteBuilder app)
    {
        var auth = app.MapGroup("/api/auth");

        // Endpoints that take a password, code or token are rate limited per address.
        var limited = auth.MapGroup("").RequireRateLimiting("auth");
        limited.MapPost("/register", Register);
        limited.MapPost("/login", Login);
        limited.MapPost("/accept-invite", AcceptInvite);
        limited.MapPost("/forgot-password", ForgotPassword);
        limited.MapPost("/reset-password", ResetPassword);
        limited.MapPost("/external/exchange", ExchangeCode);

        auth.MapPost("/guest", StartGuest).RequireRateLimiting("guest");
        auth.MapPost("/guest/upgrade", UpgradeGuest).RequireAuthorization().RequireRateLimiting("auth");

        // Holding a valid refresh token is the credential here, so no per-address limit.
        auth.MapPost("/refresh", Refresh);
        auth.MapPost("/logout", Logout);

        auth.MapGet("/providers", (IConfiguration config) => ExternalProviders.Enabled(config));
        auth.MapGet("/external/callback", ExternalCallback);
        auth.MapGet("/external/{provider}", ExternalChallenge);

        var twoFactor = auth.MapGroup("/2fa").RequireAuthorization().RequireRateLimiting("auth");
        twoFactor.MapPost("/setup", SetupTwoFactor);
        twoFactor.MapPost("/enable", EnableTwoFactor);
        twoFactor.MapPost("/disable", DisableTwoFactor);

        app.MapGet("/api/me", Me).RequireAuthorization();
    }

    // ---- accounts -------------------------------------------------------------------------

    private static async Task<IResult> Register(
        RegisterRequest req, UserManager<AppUser> users, AppDbContext db, SessionService sessions,
        TimeProvider clock, CancellationToken ct)
    {
        var email = req.Email?.Trim() ?? "";
        if (!Validation.IsValidEmail(email)) return Error(400, "invalid_request", "Enter a valid email address.");
        var problem = Validation.Profile(req.DisplayName, req.CountryCode, req.BirthYear, req.LearnerProfile, clock.GetUtcNow().Year);
        if (problem is not null) return Error(400, "invalid_request", problem);
        if (string.IsNullOrEmpty(req.Password)) return Error(400, "weak_password", "Choose a password.");

        var now = clock.GetUtcNow();
        var user = new AppUser { UserName = email, Email = email, CreatedAt = now };
        var created = await users.CreateAsync(user, req.Password);
        if (!created.Succeeded) return Failed(created);

        await users.AddToRoleAsync(user, Roles.Learner);
        db.Profiles.Add(NewProfile(user.Id, req, now));
        await db.SaveChangesAsync(ct);
        return Results.Ok(await sessions.StartSessionAsync(user, ct));
    }

    private static async Task<IResult> Login(
        LoginRequest req, UserManager<AppUser> users, SessionService sessions, CancellationToken ct)
    {
        var email = req.Email?.Trim();
        if (string.IsNullOrEmpty(email) || string.IsNullOrEmpty(req.Password))
        {
            return Error(401, "invalid_credentials", "The email or password does not match.");
        }

        var user = await users.FindByEmailAsync(email);
        if (user is null || user.IsGuest)
        {
            return Error(401, "invalid_credentials", "The email or password does not match.");
        }
        if (await users.IsLockedOutAsync(user)) return LockedOut();

        if (!await users.CheckPasswordAsync(user, req.Password))
        {
            await users.AccessFailedAsync(user);
            return await users.IsLockedOutAsync(user)
                ? LockedOut()
                : Error(401, "invalid_credentials", "The email or password does not match.");
        }

        if (user.TwoFactorEnabled)
        {
            var typed = req.OtpCode?.Trim() ?? "";
            if (typed.Length == 0) return Error(401, "otp_required");

            var digits = typed.Replace(" ", "").Replace("-", "");
            var valid = await users.VerifyTwoFactorTokenAsync(user, users.Options.Tokens.AuthenticatorTokenProvider, digits);
            if (!valid) valid = (await users.RedeemTwoFactorRecoveryCodeAsync(user, typed)).Succeeded;
            if (!valid)
            {
                await users.AccessFailedAsync(user);
                return Error(401, "invalid_otp", "That code is not right.");
            }
        }

        await users.ResetAccessFailedCountAsync(user);
        return Results.Ok(await sessions.StartSessionAsync(user, ct));
    }

    private static async Task<IResult> StartGuest(
        UserManager<AppUser> users, AppDbContext db, SessionService sessions, TimeProvider clock, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var user = new AppUser { UserName = $"guest-{Guid.NewGuid():N}", IsGuest = true, CreatedAt = now };
        var created = await users.CreateAsync(user);
        if (!created.Succeeded) return Failed(created);

        await users.AddToRoleAsync(user, Roles.Learner);
        db.Profiles.Add(new UserProfile { UserId = user.Id, DisplayName = "Guest", UpdatedAt = now });
        await db.SaveChangesAsync(ct);
        return Results.Ok(await sessions.StartSessionAsync(user, ct));
    }

    private static async Task<IResult> UpgradeGuest(
        RegisterRequest req, ClaimsPrincipal principal, UserManager<AppUser> users, AppDbContext db,
        SessionService sessions, TimeProvider clock, CancellationToken ct)
    {
        var user = principal.UserId() is { } id ? await users.FindByIdAsync(id.ToString()) : null;
        if (user is null) return Error(401, "invalid_token");
        if (!user.IsGuest) return Error(400, "not_guest", "This account is already a full account.");

        var email = req.Email?.Trim() ?? "";
        if (!Validation.IsValidEmail(email)) return Error(400, "invalid_request", "Enter a valid email address.");
        var now = clock.GetUtcNow();
        var problem = Validation.Profile(req.DisplayName, req.CountryCode, req.BirthYear, req.LearnerProfile, now.Year);
        if (problem is not null) return Error(400, "invalid_request", problem);
        if (string.IsNullOrEmpty(req.Password)) return Error(400, "weak_password", "Choose a password.");

        // Nothing is saved unless the password and the new email both pass validation.
        user.UserName = email;
        user.Email = email;
        user.IsGuest = false;
        var added = await users.AddPasswordAsync(user, req.Password);
        if (!added.Succeeded) return Failed(added);

        var profile = await db.Profiles.FirstOrDefaultAsync(p => p.UserId == user.Id, ct);
        if (profile is null)
        {
            db.Profiles.Add(NewProfile(user.Id, req, now));
        }
        else
        {
            Apply(profile, req, now);
        }
        await db.SaveChangesAsync(ct);
        return Results.Ok(await sessions.StartSessionAsync(user, ct));
    }

    private static async Task<IResult> AcceptInvite(
        AcceptInviteRequest req, UserManager<AppUser> users, AppDbContext db, SessionService sessions,
        TimeProvider clock, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(req.Token)) return Error(400, "invalid_invite", "This invitation is not valid.");
        var problem = Validation.Profile(req.DisplayName, null, null, null, clock.GetUtcNow().Year);
        if (problem is not null) return Error(400, "invalid_request", problem);
        if (string.IsNullOrEmpty(req.Password)) return Error(400, "weak_password", "Choose a password.");

        var now = clock.GetUtcNow();
        var hash = TokenService.Hash(req.Token);
        var invite = await db.Invites.FirstOrDefaultAsync(i => i.TokenHash == hash, ct);
        if (invite is null || invite.AcceptedAt is not null || invite.ExpiresAt <= now)
        {
            return Error(400, "invalid_invite", "This invitation is not valid or has expired.");
        }

        var user = new AppUser
        {
            UserName = invite.Email,
            Email = invite.Email,
            EmailConfirmed = true, // the invitation was delivered to this address
            CreatedAt = now,
        };
        var created = await users.CreateAsync(user, req.Password);
        if (!created.Succeeded) return Failed(created);

        await users.AddToRoleAsync(user, invite.RoleName);
        db.Profiles.Add(new UserProfile { UserId = user.Id, DisplayName = req.DisplayName!.Trim(), UpdatedAt = now });
        invite.AcceptedAt = now;
        await db.SaveChangesAsync(ct);
        return Results.Ok(await sessions.StartSessionAsync(user, ct));
    }

    private static async Task<IResult> Me(
        ClaimsPrincipal principal, UserManager<AppUser> users, SessionService sessions, CancellationToken ct)
    {
        var user = principal.UserId() is { } id ? await users.FindByIdAsync(id.ToString()) : null;
        return user is null ? Error(401, "invalid_token") : Results.Ok(await sessions.ToUserDtoAsync(user, ct));
    }

    // ---- tokens ---------------------------------------------------------------------------

    private static async Task<IResult> Refresh(
        RefreshRequest req, TokenService tokens, UserManager<AppUser> users, SessionService sessions, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(req.RefreshToken)) return Error(401, "invalid_token");
        var rotated = await tokens.RotateAsync(req.RefreshToken, ct);
        if (!rotated.Succeeded) return Error(401, "invalid_token");

        var user = await users.FindByIdAsync(rotated.UserId!.Value.ToString());
        if (user is null || await users.IsLockedOutAsync(user)) return Error(401, "invalid_token");
        return Results.Ok(await sessions.StartSessionAsync(user, ct, rotated.RefreshToken));
    }

    private static async Task<IResult> Logout(RefreshRequest req, TokenService tokens, CancellationToken ct)
    {
        if (!string.IsNullOrEmpty(req.RefreshToken)) await tokens.RevokeAsync(req.RefreshToken, ct);
        return Results.NoContent();
    }

    // ---- password reset -------------------------------------------------------------------

    private static async Task<IResult> ForgotPassword(
        ForgotPasswordRequest req, UserManager<AppUser> users, IEmailSender email, IOptions<AppOptions> app,
        CancellationToken ct)
    {
        // The answer is the same whether or not the address has an account.
        var address = req.Email?.Trim();
        if (string.IsNullOrEmpty(address)) return Results.NoContent();

        var user = await users.FindByEmailAsync(address);
        if (user is null || user.IsGuest || string.IsNullOrEmpty(user.Email)) return Results.NoContent();

        var token = await users.GeneratePasswordResetTokenAsync(user);
        var link = $"{app.Value.WebBaseUrl.TrimEnd('/')}/reset-password" +
                   $"?email={Uri.EscapeDataString(user.Email)}&token={Uri.EscapeDataString(token)}";
        await email.SendAsync(user.Email, "Reset your Indilingo password", EmailTemplates.PasswordReset(link), ct);
        return Results.NoContent();
    }

    private static async Task<IResult> ResetPassword(
        ResetPasswordRequest req, UserManager<AppUser> users, TokenService tokens, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrEmpty(req.Token))
        {
            return Error(400, "invalid_token", "This reset link is not valid.");
        }
        if (string.IsNullOrEmpty(req.NewPassword)) return Error(400, "weak_password", "Choose a password.");

        var user = await users.FindByEmailAsync(req.Email.Trim());
        if (user is null) return Error(400, "invalid_token", "This reset link is not valid or has expired.");

        var result = await users.ResetPasswordAsync(user, req.Token, req.NewPassword);
        if (!result.Succeeded) return Failed(result);

        await users.ResetAccessFailedCountAsync(user);
        await tokens.RevokeAllAsync(user.Id, ct); // sign out everywhere
        return Results.NoContent();
    }

    // ---- two-factor -----------------------------------------------------------------------

    private static async Task<IResult> SetupTwoFactor(ClaimsPrincipal principal, UserManager<AppUser> users)
    {
        var user = principal.UserId() is { } id ? await users.FindByIdAsync(id.ToString()) : null;
        if (user is null) return Error(401, "invalid_token");
        if (user.IsGuest || string.IsNullOrEmpty(user.Email))
        {
            return Error(400, "account_required", "Create an account first to use two-factor sign-in.");
        }
        if (user.TwoFactorEnabled) return Error(400, "two_factor_already_enabled");

        var key = await users.GetAuthenticatorKeyAsync(user);
        if (string.IsNullOrEmpty(key))
        {
            await users.ResetAuthenticatorKeyAsync(user);
            key = await users.GetAuthenticatorKeyAsync(user);
        }
        var secret = key!.Replace(" ", "").ToUpperInvariant();
        var uri = $"otpauth://totp/Indilingo:{Uri.EscapeDataString(user.Email)}" +
                  $"?secret={secret}&issuer=Indilingo&digits=6";
        return Results.Ok(new TwoFactorSetupResponse(GroupBy4(secret), uri));
    }

    private static async Task<IResult> EnableTwoFactor(
        EnableTwoFactorRequest req, ClaimsPrincipal principal, UserManager<AppUser> users)
    {
        var user = principal.UserId() is { } id ? await users.FindByIdAsync(id.ToString()) : null;
        if (user is null) return Error(401, "invalid_token");

        var code = (req.Code ?? "").Replace(" ", "").Replace("-", "");
        var valid = code.Length > 0 &&
                    await users.VerifyTwoFactorTokenAsync(user, users.Options.Tokens.AuthenticatorTokenProvider, code);
        if (!valid) return Error(400, "invalid_otp", "That code is not right.");

        await users.SetTwoFactorEnabledAsync(user, true);
        var codes = await users.GenerateNewTwoFactorRecoveryCodesAsync(user, 10);
        return Results.Ok(new RecoveryCodesResponse((codes ?? []).ToList()));
    }

    private static async Task<IResult> DisableTwoFactor(
        DisableTwoFactorRequest req, ClaimsPrincipal principal, UserManager<AppUser> users)
    {
        var user = principal.UserId() is { } id ? await users.FindByIdAsync(id.ToString()) : null;
        if (user is null) return Error(401, "invalid_token");
        if (await users.IsInRoleAsync(user, Roles.Admin))
        {
            return Error(400, "two_factor_required", "Admins must keep two-factor sign-in on.");
        }
        if (string.IsNullOrEmpty(req.Password) || !await users.CheckPasswordAsync(user, req.Password))
        {
            return Error(401, "invalid_credentials", "The password does not match.");
        }

        await users.SetTwoFactorEnabledAsync(user, false);
        await users.ResetAuthenticatorKeyAsync(user);
        return Results.NoContent();
    }

    // ---- social sign-in -------------------------------------------------------------------

    private static IResult ExternalChallenge(
        string provider, string? returnUrl, IConfiguration config, IOptions<AppOptions> app)
    {
        if (!ExternalProviders.TryGetScheme(config, provider, out var scheme))
        {
            return Error(404, "unknown_provider", "That sign-in method is not available.");
        }
        if (!ExternalProviders.IsAllowedReturnUrl(returnUrl, app.Value))
        {
            return Error(400, "invalid_request", "The return address is not allowed.");
        }

        var properties = new AuthenticationProperties { RedirectUri = "/api/auth/external/callback" };
        properties.Items["scheme"] = scheme;
        properties.Items["returnUrl"] = returnUrl;
        return Results.Challenge(properties, [scheme]);
    }

    private static async Task<IResult> ExternalCallback(
        HttpContext http, ExternalLoginService external, ExternalCodeStore codes, IOptions<AppOptions> app,
        CancellationToken ct)
    {
        var result = await http.AuthenticateAsync(IdentityConstants.ExternalScheme);
        await http.SignOutAsync(IdentityConstants.ExternalScheme);

        var fallback = $"{app.Value.WebBaseUrl.TrimEnd('/')}/auth/callback";
        string? returnUrl = null;
        result.Properties?.Items.TryGetValue("returnUrl", out returnUrl);
        var target = ExternalProviders.IsAllowedReturnUrl(returnUrl, app.Value) ? returnUrl! : fallback;

        string? scheme = null;
        result.Properties?.Items.TryGetValue("scheme", out scheme);
        var key = result.Principal?.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!result.Succeeded || string.IsNullOrEmpty(scheme) || string.IsNullOrEmpty(key))
        {
            return Results.Redirect(WithQuery(target, "error", "external_failed"));
        }

        var outcome = await external.ResolveAsync(
            scheme, key,
            result.Principal!.FindFirstValue(ClaimTypes.Email),
            result.Principal.FindFirstValue(ClaimTypes.Name),
            ct);
        return outcome.User is null
            ? Results.Redirect(WithQuery(target, "error", outcome.Error ?? "external_failed"))
            : Results.Redirect(WithQuery(target, "code", codes.Issue(outcome.User.Id)));
    }

    private static async Task<IResult> ExchangeCode(
        ExchangeRequest req, ExternalCodeStore codes, UserManager<AppUser> users, SessionService sessions,
        CancellationToken ct)
    {
        var userId = string.IsNullOrEmpty(req.Code) ? null : codes.Redeem(req.Code);
        var user = userId is { } id ? await users.FindByIdAsync(id.ToString()) : null;
        if (user is null) return Error(400, "invalid_token", "The sign-in link expired. Please try again.");
        return Results.Ok(await sessions.StartSessionAsync(user, ct));
    }

    // ---- helpers --------------------------------------------------------------------------

    private static IResult LockedOut() =>
        Error(423, "locked_out", "Too many failed attempts. Try again in a few minutes.");

    private static string WithQuery(string url, string key, string value) =>
        $"{url}{(url.Contains('?') ? '&' : '?')}{key}={Uri.EscapeDataString(value)}";

    private static string GroupBy4(string value) =>
        string.Join(' ', Enumerable.Range(0, (value.Length + 3) / 4).Select(i => value.Substring(i * 4, Math.Min(4, value.Length - i * 4))));

    private static UserProfile NewProfile(Guid userId, RegisterRequest req, DateTimeOffset now)
    {
        var profile = new UserProfile { UserId = userId };
        Apply(profile, req, now);
        return profile;
    }

    private static void Apply(UserProfile profile, RegisterRequest req, DateTimeOffset now)
    {
        profile.DisplayName = req.DisplayName!.Trim();
        profile.CountryCode = req.CountryCode?.ToUpperInvariant();
        profile.BirthYear = req.BirthYear is { } y ? (short)y : null;
        profile.LearnerProfile = req.LearnerProfile;
        profile.UpdatedAt = now;
    }
}
