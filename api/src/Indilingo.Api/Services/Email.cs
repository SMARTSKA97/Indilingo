using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Encodings.Web;
using Indilingo.Api.Options;
using Microsoft.Extensions.Options;

namespace Indilingo.Api.Services;

public interface IEmailSender
{
    /// <summary>Returns false when the message could not be sent.</summary>
    Task<bool> SendAsync(string to, string subject, string html, CancellationToken ct = default);
}

/// <summary>Sends through Brevo's transactional email API.</summary>
public sealed class BrevoEmailSender(HttpClient http, IOptions<BrevoOptions> options, ILogger<BrevoEmailSender> logger)
    : IEmailSender
{
    public async Task<bool> SendAsync(string to, string subject, string html, CancellationToken ct = default)
    {
        var o = options.Value;
        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.brevo.com/v3/smtp/email")
        {
            Content = JsonContent.Create(new
            {
                sender = new { name = o.SenderName, email = o.SenderEmail },
                to = new[] { new { email = to } },
                subject,
                htmlContent = html,
            }),
        };
        request.Headers.Add("api-key", o.ApiKey);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        try
        {
            using var response = await http.SendAsync(request, ct);
            if (response.IsSuccessStatusCode) return true;
            logger.LogWarning("Brevo refused an email with status {Status}", (int)response.StatusCode);
            return false;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            logger.LogWarning(ex, "Brevo could not be reached");
            return false;
        }
    }
}

/// <summary>Used when Brevo is not configured (local development). Writes the message to the log.</summary>
public sealed class LoggingEmailSender(ILogger<LoggingEmailSender> logger) : IEmailSender
{
    public Task<bool> SendAsync(string to, string subject, string html, CancellationToken ct = default)
    {
        logger.LogWarning("Email is not configured. Would have sent to {To}: {Subject}\n{Body}", to, subject, html);
        return Task.FromResult(true);
    }
}

public static class EmailTemplates
{
    public static string Invite(string role, string link) =>
        Wrap("You are invited to Indilingo",
            $"You have been invited to help with Indilingo as <b>{Enc(role)}</b>.",
            "Accept invitation", link,
            "The link works once and expires soon. If you were not expecting this, ignore this email.");

    public static string PasswordReset(string link) =>
        Wrap("Reset your Indilingo password",
            "We received a request to reset your password.",
            "Choose a new password", link,
            "If you did not ask for this, you can ignore this email. Your password stays the same.");

    private static string Wrap(string title, string intro, string button, string link, string footer) =>
        $"""
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#222">
          <h2>{Enc(title)}</h2>
          <p>{intro}</p>
          <p><a href="{Enc(link)}" style="background:#f58a1f;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;display:inline-block">{Enc(button)}</a></p>
          <p style="font-size:13px;color:#555">Or open this address: {Enc(link)}</p>
          <p style="font-size:13px;color:#555">{Enc(footer)}</p>
        </div>
        """;

    private static string Enc(string s) => HtmlEncoder.Default.Encode(s);
}
