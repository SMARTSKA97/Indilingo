using Indilingo.Api.Data;
using Indilingo.Api.Options;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Indilingo.Api.Services;

/// <summary>
/// First-run helper: when no admin exists and Bootstrap:AdminEmail is set, sends that address an admin invitation.
/// </summary>
public sealed class BootstrapAdminService(
    IServiceScopeFactory scopes,
    IOptions<BootstrapOptions> options,
    TimeProvider clock,
    ILogger<BootstrapAdminService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var address = options.Value.AdminEmail.Trim();
        if (address.Length == 0) return;
        if (!Validation.IsValidEmail(address))
        {
            logger.LogWarning("Bootstrap:AdminEmail is not a valid email address");
            return;
        }

        try
        {
            using var scope = scopes.CreateScope();
            var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

            if ((await users.GetUsersInRoleAsync(Roles.Admin)).Count > 0) return;

            var now = clock.GetUtcNow();
            var pending = await db.Invites.AnyAsync(
                i => i.RoleName == Roles.Admin && i.AcceptedAt == null && i.ExpiresAt > now, stoppingToken);
            if (pending) return;

            var invites = scope.ServiceProvider.GetRequiredService<InviteService>();
            var invite = await invites.CreateAndSendAsync(address, Roles.Admin, null, stoppingToken);
            logger.LogInformation(invite is null
                ? "Could not send the first admin invitation to {Email}"
                : "Sent the first admin invitation to {Email}", address);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Could not create the first admin invitation");
        }
    }
}

/// <summary>Removes expired refresh tokens and old invitations a few times a day.</summary>
public sealed class CleanupService(IServiceScopeFactory scopes, TimeProvider clock, ILogger<CleanupService> logger)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromMinutes(2), stoppingToken);
        using var timer = new PeriodicTimer(TimeSpan.FromHours(6));
        do
        {
            try
            {
                using var scope = scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var now = clock.GetUtcNow();
                var tokenCutoff = now.AddDays(-7);
                var inviteCutoff = now.AddDays(-30);
                var tokens = await db.RefreshTokens
                    .Where(t => t.ExpiresAt < tokenCutoff || (t.RevokedAt != null && t.RevokedAt < tokenCutoff))
                    .ExecuteDeleteAsync(stoppingToken);
                var invites = await db.Invites
                    .Where(i => i.ExpiresAt < inviteCutoff)
                    .ExecuteDeleteAsync(stoppingToken);
                logger.LogInformation("Cleanup removed {Tokens} refresh tokens and {Invites} invitations", tokens, invites);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Cleanup failed");
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
