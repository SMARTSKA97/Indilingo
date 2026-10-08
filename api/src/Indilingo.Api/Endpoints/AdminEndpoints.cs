using System.Security.Claims;
using Indilingo.Api.Auth;
using Indilingo.Api.Contracts;
using Indilingo.Api.Data;
using Indilingo.Api.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using static Indilingo.Api.Endpoints.ApiResults;

namespace Indilingo.Api.Endpoints;

public static class AdminEndpoints
{
    public static void MapAdmin(this IEndpointRouteBuilder app)
    {
        var admin = app.MapGroup("/api/admin").RequireAuthorization(Policies.AdminTwoFactor);
        admin.MapGet("/invites", ListInvites);
        admin.MapPost("/invites", CreateInvite).RequireRateLimiting("auth");
    }

    private static async Task<IResult> ListInvites(AppDbContext db, CancellationToken ct)
    {
        var rows = await db.Invites.AsNoTracking()
            .OrderByDescending(i => i.CreatedAt)
            .Take(100)
            .ToListAsync(ct);
        return Results.Ok(rows.Select(ToDto));
    }

    private static async Task<IResult> CreateInvite(
        CreateInviteRequest req, ClaimsPrincipal principal, UserManager<AppUser> users, InviteService invites,
        CancellationToken ct)
    {
        var address = req.Email?.Trim() ?? "";
        if (!Validation.IsValidEmail(address)) return Error(400, "invalid_request", "Enter a valid email address.");
        if (req.Role is null || !Roles.Invitable.Contains(req.Role))
        {
            return Error(400, "invalid_request", "Choose Reviewer or Admin.");
        }
        if (await users.FindByEmailAsync(address) is not null)
        {
            return Error(409, "email_taken", "Someone with this email already has an account.");
        }

        var invite = await invites.CreateAndSendAsync(address, req.Role, principal.UserId(), ct);
        return invite is null
            ? Error(502, "email_failed", "The invitation email could not be sent. Try again in a moment.")
            : Results.Created($"/api/admin/invites/{invite.Id}", ToDto(invite));
    }

    private static InviteDto ToDto(Invite i) =>
        new(i.Id, i.Email, i.RoleName, i.CreatedAt, i.ExpiresAt, i.AcceptedAt);
}
