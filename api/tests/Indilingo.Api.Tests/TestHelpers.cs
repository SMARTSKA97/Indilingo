using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;

namespace Indilingo.Api.Tests;

public sealed record TestUser(Guid Id, string? Email, string DisplayName, string[] Roles, bool IsGuest, bool TwoFactorEnabled);
public sealed record TestAuth(string AccessToken, string RefreshToken, int ExpiresIn, TestUser User);
public sealed record TestError(string Code, string? Message);

public static class TestHelpers
{
    public const string Password = "correct-horse-battery";

    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static async Task<T> ReadAsync<T>(this HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<T>(Json))!;

    public static async Task<string?> ErrorCodeAsync(this HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<TestError>(Json))?.Code;

    public static Task<HttpResponseMessage> PostAsync(this HttpClient client, string url, object body) =>
        client.PostAsJsonAsync(url, body, Json);

    public static HttpClient WithToken(this HttpClient client, string accessToken)
    {
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        return client;
    }

    public static async Task<TestAuth> RegisterAsync(this HttpClient client, string email, string name = "Asha")
    {
        var response = await client.PostAsync("/api/auth/register", new { email, password = Password, displayName = name });
        Assert.Equal(System.Net.HttpStatusCode.OK, response.StatusCode);
        return await response.ReadAsync<TestAuth>();
    }

    public static async Task<TestAuth> LoginAsync(this HttpClient client, string email, string password = Password, string? otp = null)
    {
        var response = await client.PostAsync("/api/auth/login", new { email, password, otpCode = otp });
        Assert.Equal(System.Net.HttpStatusCode.OK, response.StatusCode);
        return await response.ReadAsync<TestAuth>();
    }

    /// <summary>Current six-digit code for a base32 authenticator key (RFC 6238, 30-second steps).</summary>
    public static string Totp(string base32Key, DateTimeOffset? at = null)
    {
        var key = DecodeBase32(base32Key.Replace(" ", "").ToUpperInvariant());
        var counter = (at ?? DateTimeOffset.UtcNow).ToUnixTimeSeconds() / 30;
        var message = BitConverter.GetBytes(counter);
        if (BitConverter.IsLittleEndian) Array.Reverse(message);
        var hash = HMACSHA1.HashData(key, message);
        var offset = hash[^1] & 0x0F;
        var binary = ((hash[offset] & 0x7F) << 24) | (hash[offset + 1] << 16) | (hash[offset + 2] << 8) | hash[offset + 3];
        return (binary % 1_000_000).ToString("D6");
    }

    private static byte[] DecodeBase32(string input)
    {
        const string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        var bytes = new List<byte>();
        var buffer = 0;
        var bits = 0;
        foreach (var c in input.TrimEnd('='))
        {
            buffer = (buffer << 5) | alphabet.IndexOf(c);
            bits += 5;
            if (bits >= 8)
            {
                bits -= 8;
                bytes.Add((byte)((buffer >> bits) & 0xFF));
            }
        }
        return bytes.ToArray();
    }

    /// <summary>Pulls a query parameter out of the first link in an email.</summary>
    public static string LinkParameter(string html, string name)
    {
        var start = html.IndexOf("href=\"", StringComparison.Ordinal) + 6;
        var end = html.IndexOf('"', start);
        var link = System.Net.WebUtility.HtmlDecode(html[start..end]);
        var query = System.Web.HttpUtility.ParseQueryString(new Uri(link).Query);
        return query[name]!;
    }
}
