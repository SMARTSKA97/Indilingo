using System.Collections.Concurrent;

namespace Indilingo.Api.Services;

/// <summary>
/// Holds the one-time codes handed to the web app after a social sign-in. A code works once and for one minute,
/// so tokens never travel in a URL.
/// </summary>
public sealed class ExternalCodeStore(TimeProvider clock)
{
    private static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(1);
    private readonly ConcurrentDictionary<string, (Guid UserId, DateTimeOffset Expires)> codes = new();

    public string Issue(Guid userId)
    {
        Prune();
        var code = TokenService.NewSecret();
        codes[code] = (userId, clock.GetUtcNow().Add(Lifetime));
        return code;
    }

    public Guid? Redeem(string code)
    {
        if (!codes.TryRemove(code, out var entry)) return null;
        return entry.Expires > clock.GetUtcNow() ? entry.UserId : null;
    }

    private void Prune()
    {
        var now = clock.GetUtcNow();
        foreach (var pair in codes.Where(p => p.Value.Expires <= now)) codes.TryRemove(pair.Key, out _);
    }
}
