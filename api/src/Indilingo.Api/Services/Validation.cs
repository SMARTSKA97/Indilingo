using System.Net.Mail;
using System.Text.RegularExpressions;

namespace Indilingo.Api.Services;

public static partial class Validation
{
    public static bool IsValidEmail(string? email)
    {
        if (string.IsNullOrWhiteSpace(email) || email.Length > 256) return false;
        if (!MailAddress.TryCreate(email, out var parsed)) return false;
        return parsed.Address == email && parsed.Host.Contains('.');
    }

    /// <summary>Returns a message for the first problem found, or null when the profile is acceptable.</summary>
    public static string? Profile(string? displayName, string? countryCode, int? birthYear, string? learnerProfile, int currentYear)
    {
        var name = displayName?.Trim() ?? "";
        if (name.Length is 0 or > 40) return "Enter a display name of up to 40 characters.";
        if (name.Any(char.IsControl)) return "The display name contains characters that are not allowed.";
        if (countryCode is not null && !CountryCodePattern().IsMatch(countryCode)) return "Choose a valid country.";
        if (birthYear is not null && (birthYear < 1900 || birthYear > currentYear)) return "Enter a valid birth year.";
        if (learnerProfile is { Length: > 40 }) return "The learner profile is too long.";
        return null;
    }

    [GeneratedRegex("^[A-Za-z]{2}$")]
    private static partial Regex CountryCodePattern();
}
