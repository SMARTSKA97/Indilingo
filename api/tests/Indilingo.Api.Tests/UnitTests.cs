using Indilingo.Api.Data;
using Indilingo.Api.Services;

namespace Indilingo.Api.Tests;

public class ConnectionStringTests
{
    [Fact]
    public void Leaves_a_normal_connection_string_alone()
    {
        const string value = "Host=db;Database=x;Username=u;Password=p";
        Assert.Equal(value, ConnectionStrings.Normalize(value));
    }

    [Fact]
    public void Converts_a_neon_style_url()
    {
        var result = ConnectionStrings.Normalize("postgresql://user:p%40ss@ep-cool.neon.tech/indilingo?sslmode=require");
        Assert.Contains("Host=ep-cool.neon.tech", result);
        Assert.Contains("Database=indilingo", result);
        Assert.Contains("Username=user", result);
        Assert.Contains("Password=p@ss", result);
        Assert.Contains("SSL Mode=Require", result);
    }

    [Fact]
    public void Uses_the_default_port_when_none_is_given()
    {
        Assert.Contains("Port=5432", ConnectionStrings.Normalize("postgres://u:p@host/db"));
    }
}

public class ValidationTests
{
    [Theory]
    [InlineData("asha@example.com", true)]
    [InlineData("asha@example", false)]
    [InlineData("not an email", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void Checks_email_addresses(string? email, bool expected) =>
        Assert.Equal(expected, Validation.IsValidEmail(email));

    [Fact]
    public void Accepts_a_complete_profile() =>
        Assert.Null(Validation.Profile("Asha", "IN", 1998, "student", 2026));

    [Theory]
    [InlineData("", "IN", 1998)]
    [InlineData("   ", "IN", 1998)]
    [InlineData("Asha", "India", 1998)]
    [InlineData("Asha", "IN", 1850)]
    [InlineData("Asha", "IN", 2999)]
    public void Rejects_bad_profiles(string name, string country, int year) =>
        Assert.NotNull(Validation.Profile(name, country, year, null, 2026));

    [Fact]
    public void Rejects_a_name_longer_than_forty_characters() =>
        Assert.NotNull(Validation.Profile(new string('a', 41), null, null, null, 2026));
}

public class SnakeCaseTests
{
    [Theory]
    [InlineData("Id", "id")]
    [InlineData("UserName", "user_name")]
    [InlineData("NormalizedUserName", "normalized_user_name")]
    [InlineData("TwoFactorEnabled", "two_factor_enabled")]
    [InlineData("UserId", "user_id")]
    [InlineData("Xml", "xml")]
    public void Converts(string input, string expected) =>
        Assert.Equal(expected, AppDbContext.ToSnakeCase(input));
}

public class ExternalCodeStoreTests
{
    [Fact]
    public void A_code_works_once()
    {
        var store = new ExternalCodeStore(TimeProvider.System);
        var id = Guid.NewGuid();
        var code = store.Issue(id);
        Assert.Equal(id, store.Redeem(code));
        Assert.Null(store.Redeem(code));
    }

    [Fact]
    public void An_unknown_code_fails() =>
        Assert.Null(new ExternalCodeStore(TimeProvider.System).Redeem("nope"));

    [Fact]
    public void A_code_expires_after_a_minute()
    {
        var clock = new ManualClock(DateTimeOffset.UtcNow);
        var store = new ExternalCodeStore(clock);
        var code = store.Issue(Guid.NewGuid());
        clock.Advance(TimeSpan.FromSeconds(61));
        Assert.Null(store.Redeem(code));
    }
}

public sealed class ManualClock(DateTimeOffset start) : TimeProvider
{
    private DateTimeOffset now = start;
    public void Advance(TimeSpan by) => now += by;
    public override DateTimeOffset GetUtcNow() => now;
}
