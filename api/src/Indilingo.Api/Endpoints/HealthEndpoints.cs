using Indilingo.Api.Data;

namespace Indilingo.Api.Endpoints;

public static class HealthEndpoints
{
    public static void MapHealth(this IEndpointRouteBuilder app)
    {
        // Liveness: the process is up. Used by Render and uptime pings.
        app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));

        // Readiness: the database answers too.
        app.MapGet("/api/health/ready", async (AppDbContext db, CancellationToken ct) =>
            await db.Database.CanConnectAsync(ct)
                ? Results.Ok(new { status = "ok", database = "ok" })
                : Results.Json(new { status = "degraded", database = "unreachable" }, statusCode: 503));
    }
}
