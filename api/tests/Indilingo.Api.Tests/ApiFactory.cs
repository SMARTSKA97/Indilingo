using Indilingo.Api.Data;
using Indilingo.Api.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace Indilingo.Api.Tests;

public sealed record SentEmail(string To, string Subject, string Html);

public sealed class FakeEmailSender : IEmailSender
{
    private readonly List<SentEmail> sent = [];
    public bool Fail { get; set; }
    public IReadOnlyList<SentEmail> Sent { get { lock (sent) return sent.ToList(); } }

    public Task<bool> SendAsync(string to, string subject, string html, CancellationToken ct = default)
    {
        if (Fail) return Task.FromResult(false);
        lock (sent) sent.Add(new SentEmail(to, subject, html));
        return Task.FromResult(true);
    }
}

/// <summary>Runs the real API in memory with an in-memory database and a fake mail sender.</summary>
public sealed class ApiFactory : WebApplicationFactory<Program>
{
    private readonly string dbName = Guid.NewGuid().ToString("N");
    public FakeEmailSender Emails { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("Jwt:SigningKey", new string('k', 48));
        builder.UseSetting("App:WebBaseUrl", "https://web.test");
        builder.UseSetting("App:AllowedOrigins:0", "https://web.test");
        builder.UseSetting("RateLimit:AuthPerMinute", "100000");
        builder.UseSetting("RateLimit:GuestPerHour", "100000");
        builder.ConfigureServices(services =>
        {
            services.AddSingleton(new DatabaseConfigurator(o => o.UseInMemoryDatabase(dbName)));
            services.RemoveAll<IEmailSender>();
            services.AddSingleton<IEmailSender>(Emails);
        });
    }

    protected override IHost CreateHost(IHostBuilder builder)
    {
        var host = base.CreateHost(builder);
        using var scope = host.Services.CreateScope();
        var roles = scope.ServiceProvider.GetRequiredService<RoleManager<AppRole>>();
        foreach (var name in new[] { Roles.Learner, Roles.Reviewer, Roles.Admin })
        {
            roles.CreateAsync(new AppRole { Name = name }).GetAwaiter().GetResult();
        }
        return host;
    }

    /// <summary>Creates an account straight in the database, for tests that need a privileged user.</summary>
    public async Task<AppUser> SeedUserAsync(string email, string password, string role, bool twoFactor = false)
    {
        using var scope = Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var user = new AppUser { UserName = email, Email = email, EmailConfirmed = true, CreatedAt = DateTimeOffset.UtcNow };
        Assert.True((await users.CreateAsync(user, password)).Succeeded);
        Assert.True((await users.AddToRoleAsync(user, role)).Succeeded);
        db.Profiles.Add(new UserProfile { UserId = user.Id, DisplayName = role, UpdatedAt = DateTimeOffset.UtcNow });
        await db.SaveChangesAsync();
        if (twoFactor)
        {
            await users.ResetAuthenticatorKeyAsync(user);
            await users.SetTwoFactorEnabledAsync(user, true);
        }
        return user;
    }

    public async Task<string> AuthenticatorKeyAsync(string email)
    {
        using var scope = Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
        var user = (await users.FindByEmailAsync(email))!;
        return (await users.GetAuthenticatorKeyAsync(user))!;
    }
}
