using Indilingo.Api.Data;
using Indilingo.Api.Options;
using Microsoft.Extensions.Options;

namespace Indilingo.Api.Services;

/// <summary>Creates reviewer and admin invitations and emails the one-time link.</summary>
public sealed class InviteService(
    AppDbContext db,
    IEmailSender email,
    IOptions<AppOptions> app,
    TimeProvider clock,
    ILogger<InviteService> logger)
{
    public async Task<Invite?> CreateAndSendAsync(string address, string role, Guid? createdBy, CancellationToken ct)
    {
        var raw = TokenService.NewSecret();
        var now = clock.GetUtcNow();
        var invite = new Invite
        {
            Id = Guid.NewGuid(),
            Email = address,
            RoleName = role,
            TokenHash = TokenService.Hash(raw),
            CreatedBy = createdBy,
            CreatedAt = now,
            ExpiresAt = now.AddDays(app.Value.InviteDays),
        };
        db.Invites.Add(invite);
        await db.SaveChangesAsync(ct);

        var link = $"{app.Value.WebBaseUrl.TrimEnd('/')}/accept-invite?token={Uri.EscapeDataString(raw)}";
        var sent = await email.SendAsync(address, "You are invited to Indilingo", EmailTemplates.Invite(role, link), ct);
        if (sent) return invite;

        logger.LogWarning("Invitation email to {Email} failed; removing the invitation", address);
        db.Invites.Remove(invite);
        await db.SaveChangesAsync(ct);
        return null;
    }
}
