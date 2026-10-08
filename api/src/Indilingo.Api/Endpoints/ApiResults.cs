using System.Security.Claims;
using Indilingo.Api.Contracts;
using Microsoft.AspNetCore.Identity;

namespace Indilingo.Api.Endpoints;

public static class ApiResults
{
    public static IResult Error(int status, string code, string? message = null) =>
        Results.Json(new ApiError(code, message), statusCode: status);

    /// <summary>Translates Identity failures into the error codes the web app understands.</summary>
    public static IResult Failed(IdentityResult result)
    {
        var errors = result.Errors.ToList();
        if (errors.Any(e => e.Code is "DuplicateEmail" or "DuplicateUserName"))
        {
            return Error(409, "email_taken", "An account with this email already exists.");
        }
        var passwordErrors = errors.Where(e => e.Code.StartsWith("Password", StringComparison.Ordinal)).ToList();
        if (passwordErrors.Count > 0)
        {
            return Error(400, "weak_password", string.Join(" ", passwordErrors.Select(e => e.Description)));
        }
        if (errors.Any(e => e.Code == "InvalidToken")) return Error(400, "invalid_token");
        return Error(400, "invalid_request", errors.FirstOrDefault()?.Description);
    }

    public static Guid? UserId(this ClaimsPrincipal principal) =>
        Guid.TryParse(principal.FindFirstValue("sub"), out var id) ? id : null;
}
