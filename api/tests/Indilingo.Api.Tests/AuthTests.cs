using System.Net;

namespace Indilingo.Api.Tests;

public class AuthTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private HttpClient Client() => factory.CreateClient();
    private static string NewEmail() => $"user-{Guid.NewGuid():N}@example.com";

    [Fact]
    public async Task Health_answers()
    {
        var response = await Client().GetAsync("/api/health");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Register_returns_tokens_and_a_learner()
    {
        var auth = await Client().RegisterAsync(NewEmail(), "Asha");
        Assert.False(string.IsNullOrEmpty(auth.AccessToken));
        Assert.False(string.IsNullOrEmpty(auth.RefreshToken));
        Assert.Equal(900, auth.ExpiresIn);
        Assert.Equal("Asha", auth.User.DisplayName);
        Assert.Equal(["Learner"], auth.User.Roles);
        Assert.False(auth.User.IsGuest);
        Assert.False(auth.User.TwoFactorEnabled);
    }

    [Fact]
    public async Task Register_keeps_the_profile()
    {
        var response = await Client().PostAsync("/api/auth/register", new
        {
            email = NewEmail(), password = TestHelpers.Password, displayName = "Meera",
            countryCode = "in", birthYear = 1999, learnerProfile = "heritage",
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Meera", (await response.ReadAsync<TestAuth>()).User.DisplayName);
    }

    [Fact]
    public async Task Register_rejects_a_repeated_email_whatever_the_case()
    {
        var email = NewEmail();
        await Client().RegisterAsync(email);
        var response = await Client().PostAsync("/api/auth/register",
            new { email = email.ToUpperInvariant(), password = TestHelpers.Password, displayName = "Again" });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("email_taken", await response.ErrorCodeAsync());
    }

    [Fact]
    public async Task Register_rejects_a_short_password()
    {
        var response = await Client().PostAsync("/api/auth/register",
            new { email = NewEmail(), password = "short", displayName = "Asha" });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("weak_password", await response.ErrorCodeAsync());
    }

    [Theory]
    [InlineData("not-an-email", "Asha")]
    [InlineData("a@example.com", "")]
    public async Task Register_rejects_bad_input(string email, string name)
    {
        var response = await Client().PostAsync("/api/auth/register",
            new { email, password = TestHelpers.Password, displayName = name });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("invalid_request", await response.ErrorCodeAsync());
    }

    [Fact]
    public async Task Login_works_and_wrong_passwords_are_refused()
    {
        var email = NewEmail();
        await Client().RegisterAsync(email);

        var good = await Client().LoginAsync(email);
        Assert.Equal(email, good.User.Email);

        var bad = await Client().PostAsync("/api/auth/login", new { email, password = "wrong-password" });
        Assert.Equal(HttpStatusCode.Unauthorized, bad.StatusCode);
        Assert.Equal("invalid_credentials", await bad.ErrorCodeAsync());
    }

    [Fact]
    public async Task Login_does_not_reveal_whether_an_account_exists()
    {
        var response = await Client().PostAsync("/api/auth/login", new { email = NewEmail(), password = "whatever-123" });
        Assert.Equal("invalid_credentials", await response.ErrorCodeAsync());
    }

    [Fact]
    public async Task Five_wrong_passwords_lock_the_account()
    {
        var email = NewEmail();
        await Client().RegisterAsync(email);
        HttpResponseMessage last = null!;
        for (var i = 0; i < 5; i++)
        {
            last = await Client().PostAsync("/api/auth/login", new { email, password = "wrong-password" });
        }
        Assert.Equal((HttpStatusCode)423, last.StatusCode);
        Assert.Equal("locked_out", await last.ErrorCodeAsync());

        var correct = await Client().PostAsync("/api/auth/login", new { email, password = TestHelpers.Password });
        Assert.Equal((HttpStatusCode)423, correct.StatusCode);
    }

    [Fact]
    public async Task Me_needs_a_token_and_returns_the_user()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client().GetAsync("/api/me")).StatusCode);

        var auth = await Client().RegisterAsync(NewEmail(), "Asha");
        var me = await Client().WithToken(auth.AccessToken).GetAsync("/api/me");
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        Assert.Equal("Asha", (await me.ReadAsync<TestUser>()).DisplayName);
    }

    [Fact]
    public async Task A_tampered_token_is_refused()
    {
        var auth = await Client().RegisterAsync(NewEmail());
        var response = await Client().WithToken(auth.AccessToken + "x").GetAsync("/api/me");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    // ---- guests ---------------------------------------------------------------------------

    [Fact]
    public async Task A_guest_can_start_and_then_upgrade_keeping_the_same_user()
    {
        var guest = await (await Client().PostAsync("/api/auth/guest", new { })).ReadAsync<TestAuth>();
        Assert.True(guest.User.IsGuest);
        Assert.Null(guest.User.Email);
        Assert.Equal(["Learner"], guest.User.Roles);

        var email = NewEmail();
        var upgrade = await Client().WithToken(guest.AccessToken).PostAsync("/api/auth/guest/upgrade",
            new { email, password = TestHelpers.Password, displayName = "Asha" });
        Assert.Equal(HttpStatusCode.OK, upgrade.StatusCode);
        var upgraded = await upgrade.ReadAsync<TestAuth>();
        Assert.Equal(guest.User.Id, upgraded.User.Id);
        Assert.False(upgraded.User.IsGuest);
        Assert.Equal(email, upgraded.User.Email);

        var login = await Client().LoginAsync(email);
        Assert.Equal(guest.User.Id, login.User.Id);
    }

    [Fact]
    public async Task A_full_account_cannot_be_upgraded()
    {
        var auth = await Client().RegisterAsync(NewEmail());
        var response = await Client().WithToken(auth.AccessToken).PostAsync("/api/auth/guest/upgrade",
            new { email = NewEmail(), password = TestHelpers.Password, displayName = "Asha" });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("not_guest", await response.ErrorCodeAsync());
    }

    [Fact]
    public async Task Upgrading_to_a_taken_email_fails_and_leaves_the_guest_a_guest()
    {
        var taken = NewEmail();
        await Client().RegisterAsync(taken);
        var guest = await (await Client().PostAsync("/api/auth/guest", new { })).ReadAsync<TestAuth>();

        var response = await Client().WithToken(guest.AccessToken).PostAsync("/api/auth/guest/upgrade",
            new { email = taken, password = TestHelpers.Password, displayName = "Asha" });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);

        var me = await Client().WithToken(guest.AccessToken).GetAsync("/api/me");
        Assert.True((await me.ReadAsync<TestUser>()).IsGuest);
    }

    [Fact]
    public async Task A_guest_cannot_use_two_factor()
    {
        var guest = await (await Client().PostAsync("/api/auth/guest", new { })).ReadAsync<TestAuth>();
        var response = await Client().WithToken(guest.AccessToken).PostAsync("/api/auth/2fa/setup", new { });
        Assert.Equal("account_required", await response.ErrorCodeAsync());
    }

    // ---- refresh and logout ---------------------------------------------------------------

    [Fact]
    public async Task Refresh_gives_new_tokens_and_the_old_one_stops_working()
    {
        var first = await Client().RegisterAsync(NewEmail());
        var refreshed = await Client().PostAsync("/api/auth/refresh", new { refreshToken = first.RefreshToken });
        Assert.Equal(HttpStatusCode.OK, refreshed.StatusCode);
        var second = await refreshed.ReadAsync<TestAuth>();
        Assert.NotEqual(first.RefreshToken, second.RefreshToken);
        Assert.Equal(first.User.Id, second.User.Id);

        var reuse = await Client().PostAsync("/api/auth/refresh", new { refreshToken = first.RefreshToken });
        Assert.Equal(HttpStatusCode.Unauthorized, reuse.StatusCode);
        Assert.Equal("invalid_token", await reuse.ErrorCodeAsync());

        var stillGood = await Client().PostAsync("/api/auth/refresh", new { refreshToken = second.RefreshToken });
        Assert.Equal(HttpStatusCode.OK, stillGood.StatusCode);
    }

    [Fact]
    public async Task Refresh_refuses_garbage()
    {
        var response = await Client().PostAsync("/api/auth/refresh", new { refreshToken = "garbage" });
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Logout_revokes_the_refresh_token()
    {
        var auth = await Client().RegisterAsync(NewEmail());
        var logout = await Client().PostAsync("/api/auth/logout", new { refreshToken = auth.RefreshToken });
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);

        var refresh = await Client().PostAsync("/api/auth/refresh", new { refreshToken = auth.RefreshToken });
        Assert.Equal(HttpStatusCode.Unauthorized, refresh.StatusCode);
    }

    // ---- password reset -------------------------------------------------------------------

    [Fact]
    public async Task Forgot_password_looks_the_same_for_unknown_addresses()
    {
        var before = factory.Emails.Sent.Count;
        var response = await Client().PostAsync("/api/auth/forgot-password", new { email = NewEmail() });
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(before, factory.Emails.Sent.Count);
    }

    [Fact]
    public async Task Password_reset_works_once_and_signs_out_other_devices()
    {
        var email = NewEmail();
        var auth = await Client().RegisterAsync(email);

        var ask = await Client().PostAsync("/api/auth/forgot-password", new { email });
        Assert.Equal(HttpStatusCode.NoContent, ask.StatusCode);
        var mail = factory.Emails.Sent.Last(m => m.To == email);
        var token = TestHelpers.LinkParameter(mail.Html, "token");
        Assert.Equal(email, TestHelpers.LinkParameter(mail.Html, "email"));

        var reset = await Client().PostAsync("/api/auth/reset-password",
            new { email, token, newPassword = "a-brand-new-password" });
        Assert.Equal(HttpStatusCode.NoContent, reset.StatusCode);

        await Client().LoginAsync(email, "a-brand-new-password");
        var old = await Client().PostAsync("/api/auth/login", new { email, password = TestHelpers.Password });
        Assert.Equal(HttpStatusCode.Unauthorized, old.StatusCode);

        var refresh = await Client().PostAsync("/api/auth/refresh", new { refreshToken = auth.RefreshToken });
        Assert.Equal(HttpStatusCode.Unauthorized, refresh.StatusCode);

        var again = await Client().PostAsync("/api/auth/reset-password",
            new { email, token, newPassword = "yet-another-password" });
        Assert.Equal(HttpStatusCode.BadRequest, again.StatusCode);
        Assert.Equal("invalid_token", await again.ErrorCodeAsync());
    }

    [Fact]
    public async Task Reset_with_a_weak_password_is_refused()
    {
        var email = NewEmail();
        await Client().RegisterAsync(email);
        await Client().PostAsync("/api/auth/forgot-password", new { email });
        var token = TestHelpers.LinkParameter(factory.Emails.Sent.Last(m => m.To == email).Html, "token");

        var response = await Client().PostAsync("/api/auth/reset-password", new { email, token, newPassword = "short" });
        Assert.Equal("weak_password", await response.ErrorCodeAsync());
    }

    // ---- two-factor -----------------------------------------------------------------------

    [Fact]
    public async Task Two_factor_setup_enable_and_login()
    {
        var email = NewEmail();
        var auth = await Client().RegisterAsync(email);
        var authed = Client().WithToken(auth.AccessToken);

        var setup = await authed.PostAsync("/api/auth/2fa/setup", new { });
        Assert.Equal(HttpStatusCode.OK, setup.StatusCode);
        var body = await setup.ReadAsync<SetupBody>();
        Assert.StartsWith("otpauth://totp/Indilingo:", body.OtpAuthUri);
        Assert.Contains(' ', body.SharedKey);

        var wrong = await authed.PostAsync("/api/auth/2fa/enable", new { code = "000000" });
        Assert.Equal("invalid_otp", await wrong.ErrorCodeAsync());

        var enable = await authed.PostAsync("/api/auth/2fa/enable", new { code = TestHelpers.Totp(body.SharedKey) });
        Assert.Equal(HttpStatusCode.OK, enable.StatusCode);
        var codes = (await enable.ReadAsync<CodesBody>()).RecoveryCodes;
        Assert.Equal(10, codes.Length);

        var needCode = await Client().PostAsync("/api/auth/login", new { email, password = TestHelpers.Password });
        Assert.Equal(HttpStatusCode.Unauthorized, needCode.StatusCode);
        Assert.Equal("otp_required", await needCode.ErrorCodeAsync());

        var badCode = await Client().PostAsync("/api/auth/login",
            new { email, password = TestHelpers.Password, otpCode = "000000" });
        Assert.Equal("invalid_otp", await badCode.ErrorCodeAsync());

        var signedIn = await Client().LoginAsync(email, otp: TestHelpers.Totp(body.SharedKey));
        Assert.True(signedIn.User.TwoFactorEnabled);

        var viaRecovery = await Client().LoginAsync(email, otp: codes[0]);
        Assert.Equal(email, viaRecovery.User.Email);
        var reused = await Client().PostAsync("/api/auth/login",
            new { email, password = TestHelpers.Password, otpCode = codes[0] });
        Assert.Equal("invalid_otp", await reused.ErrorCodeAsync());
    }

    [Fact]
    public async Task A_wrong_password_never_hints_that_two_factor_is_on()
    {
        var email = NewEmail();
        var auth = await Client().RegisterAsync(email);
        var authed = Client().WithToken(auth.AccessToken);
        var setup = await (await authed.PostAsync("/api/auth/2fa/setup", new { })).ReadAsync<SetupBody>();
        await authed.PostAsync("/api/auth/2fa/enable", new { code = TestHelpers.Totp(setup.SharedKey) });

        var response = await Client().PostAsync("/api/auth/login", new { email, password = "wrong-password" });
        Assert.Equal("invalid_credentials", await response.ErrorCodeAsync());
    }

    [Fact]
    public async Task A_learner_can_turn_two_factor_off_with_their_password()
    {
        var email = NewEmail();
        var auth = await Client().RegisterAsync(email);
        var authed = Client().WithToken(auth.AccessToken);
        var setup = await (await authed.PostAsync("/api/auth/2fa/setup", new { })).ReadAsync<SetupBody>();
        await authed.PostAsync("/api/auth/2fa/enable", new { code = TestHelpers.Totp(setup.SharedKey) });

        var wrong = await authed.PostAsync("/api/auth/2fa/disable", new { password = "nope-nope-nope" });
        Assert.Equal(HttpStatusCode.Unauthorized, wrong.StatusCode);

        var off = await authed.PostAsync("/api/auth/2fa/disable", new { password = TestHelpers.Password });
        Assert.Equal(HttpStatusCode.NoContent, off.StatusCode);
        Assert.False((await Client().LoginAsync(email)).User.TwoFactorEnabled);
    }

    [Fact]
    public async Task An_admin_cannot_turn_two_factor_off()
    {
        var email = NewEmail();
        await factory.SeedUserAsync(email, TestHelpers.Password, "Admin", twoFactor: true);
        var key = await factory.AuthenticatorKeyAsync(email);
        var auth = await Client().LoginAsync(email, otp: TestHelpers.Totp(key));

        var response = await Client().WithToken(auth.AccessToken)
            .PostAsync("/api/auth/2fa/disable", new { password = TestHelpers.Password });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("two_factor_required", await response.ErrorCodeAsync());
    }

    // ---- social sign-in -------------------------------------------------------------------

    [Fact]
    public async Task No_providers_are_listed_until_they_are_configured()
    {
        var response = await Client().GetAsync("/api/auth/providers");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Empty(await response.ReadAsync<string[]>());
    }

    [Fact]
    public async Task An_unconfigured_provider_is_not_found()
    {
        var response = await Client().GetAsync("/api/auth/external/google?returnUrl=https%3A%2F%2Fweb.test%2Fauth%2Fcallback");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task A_bad_exchange_code_is_refused()
    {
        var response = await Client().PostAsync("/api/auth/external/exchange", new { code = "made-up" });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("invalid_token", await response.ErrorCodeAsync());
    }

    private sealed record SetupBody(string SharedKey, string OtpAuthUri);
    private sealed record CodesBody(string[] RecoveryCodes);
}
