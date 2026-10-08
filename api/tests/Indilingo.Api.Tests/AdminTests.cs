using System.Net;

namespace Indilingo.Api.Tests;

public class AdminTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private HttpClient Client() => factory.CreateClient();
    private static string NewEmail() => $"user-{Guid.NewGuid():N}@example.com";

    private async Task<HttpClient> AdminClientAsync()
    {
        var email = NewEmail();
        await factory.SeedUserAsync(email, TestHelpers.Password, "Admin", twoFactor: true);
        var key = await factory.AuthenticatorKeyAsync(email);
        var auth = await Client().LoginAsync(email, otp: TestHelpers.Totp(key));
        return Client().WithToken(auth.AccessToken);
    }

    [Fact]
    public async Task Anonymous_callers_get_401()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client().GetAsync("/api/admin/invites")).StatusCode);
    }

    [Fact]
    public async Task Learners_get_403()
    {
        var learner = await Client().RegisterAsync(NewEmail());
        var response = await Client().WithToken(learner.AccessToken).GetAsync("/api/admin/invites");
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Reviewers_get_403()
    {
        var email = NewEmail();
        await factory.SeedUserAsync(email, TestHelpers.Password, "Reviewer");
        var auth = await Client().LoginAsync(email);
        var response = await Client().WithToken(auth.AccessToken).GetAsync("/api/admin/invites");
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task An_admin_without_two_factor_gets_403()
    {
        var email = NewEmail();
        await factory.SeedUserAsync(email, TestHelpers.Password, "Admin", twoFactor: false);
        var auth = await Client().LoginAsync(email);
        var response = await Client().WithToken(auth.AccessToken).GetAsync("/api/admin/invites");
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task An_admin_with_two_factor_can_list_invites()
    {
        var admin = await AdminClientAsync();
        var response = await admin.GetAsync("/api/admin/invites");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Invite_emails_a_link_and_the_reviewer_can_join_once()
    {
        var admin = await AdminClientAsync();
        var friend = NewEmail();

        var created = await admin.PostAsync("/api/admin/invites", new { email = friend, role = "Reviewer" });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);

        var mail = factory.Emails.Sent.Last(m => m.To == friend);
        var token = TestHelpers.LinkParameter(mail.Html, "token");
        Assert.StartsWith("https://web.test/accept-invite?token=", System.Net.WebUtility.HtmlDecode(
            mail.Html[(mail.Html.IndexOf("href=\"", StringComparison.Ordinal) + 6)..].Split('"')[0]));

        var accept = await Client().PostAsync("/api/auth/accept-invite",
            new { token, password = TestHelpers.Password, displayName = "Ravi" });
        Assert.Equal(HttpStatusCode.OK, accept.StatusCode);
        var auth = await accept.ReadAsync<TestAuth>();
        Assert.Equal(["Reviewer"], auth.User.Roles);
        Assert.Equal("Ravi", auth.User.DisplayName);
        Assert.Equal(friend, auth.User.Email);

        var again = await Client().PostAsync("/api/auth/accept-invite",
            new { token, password = TestHelpers.Password, displayName = "Ravi" });
        Assert.Equal("invalid_invite", await again.ErrorCodeAsync());

        var adminOnly = await Client().WithToken(auth.AccessToken).GetAsync("/api/admin/invites");
        Assert.Equal(HttpStatusCode.Forbidden, adminOnly.StatusCode);
    }

    [Fact]
    public async Task The_invites_list_shows_pending_and_accepted()
    {
        var admin = await AdminClientAsync();
        var friend = NewEmail();
        await admin.PostAsync("/api/admin/invites", new { email = friend, role = "Admin" });

        var list = await (await admin.GetAsync("/api/admin/invites")).ReadAsync<InviteRow[]>();
        var row = Assert.Single(list, r => r.Email == friend);
        Assert.Equal("Admin", row.Role);
        Assert.Null(row.AcceptedAt);
        Assert.True(row.ExpiresAt > DateTimeOffset.UtcNow);
    }

    [Fact]
    public async Task A_bad_token_is_refused()
    {
        var response = await Client().PostAsync("/api/auth/accept-invite",
            new { token = "unknown", password = TestHelpers.Password, displayName = "Ravi" });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("invalid_invite", await response.ErrorCodeAsync());
    }

    [Theory]
    [InlineData("Learner")]
    [InlineData("Superuser")]
    [InlineData("")]
    public async Task Only_reviewer_and_admin_can_be_invited(string role)
    {
        var admin = await AdminClientAsync();
        var response = await admin.PostAsync("/api/admin/invites", new { email = NewEmail(), role });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Inviting_someone_who_already_has_an_account_is_refused()
    {
        var admin = await AdminClientAsync();
        var existing = NewEmail();
        await Client().RegisterAsync(existing);
        var response = await admin.PostAsync("/api/admin/invites", new { email = existing, role = "Reviewer" });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task A_failed_email_means_no_invitation_is_left_behind()
    {
        var admin = await AdminClientAsync();
        var friend = NewEmail();
        factory.Emails.Fail = true;
        try
        {
            var response = await admin.PostAsync("/api/admin/invites", new { email = friend, role = "Reviewer" });
            Assert.Equal(HttpStatusCode.BadGateway, response.StatusCode);
        }
        finally
        {
            factory.Emails.Fail = false;
        }
        var list = await (await admin.GetAsync("/api/admin/invites")).ReadAsync<InviteRow[]>();
        Assert.DoesNotContain(list, r => r.Email == friend);
    }

    private sealed record InviteRow(Guid Id, string Email, string Role, DateTimeOffset CreatedAt, DateTimeOffset ExpiresAt, DateTimeOffset? AcceptedAt);
}
