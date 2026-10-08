namespace Indilingo.Api.Contracts;

public sealed record ApiError(string Code, string? Message = null);

public sealed record UserDto(
    Guid Id,
    string? Email,
    string DisplayName,
    IReadOnlyList<string> Roles,
    bool IsGuest,
    bool TwoFactorEnabled);

public sealed record AuthResponse(string AccessToken, string RefreshToken, int ExpiresIn, UserDto User);

public sealed record RegisterRequest(
    string? Email,
    string? Password,
    string? DisplayName,
    string? CountryCode,
    int? BirthYear,
    string? LearnerProfile);

public sealed record LoginRequest(string? Email, string? Password, string? OtpCode);
public sealed record AcceptInviteRequest(string? Token, string? Password, string? DisplayName);
public sealed record RefreshRequest(string? RefreshToken);
public sealed record ForgotPasswordRequest(string? Email);
public sealed record ResetPasswordRequest(string? Email, string? Token, string? NewPassword);
public sealed record ExchangeRequest(string? Code);
public sealed record EnableTwoFactorRequest(string? Code);
public sealed record DisableTwoFactorRequest(string? Password);
public sealed record TwoFactorSetupResponse(string SharedKey, string OtpAuthUri);
public sealed record RecoveryCodesResponse(IReadOnlyList<string> RecoveryCodes);
public sealed record CreateInviteRequest(string? Email, string? Role);

public sealed record InviteDto(
    Guid Id,
    string Email,
    string Role,
    DateTimeOffset CreatedAt,
    DateTimeOffset ExpiresAt,
    DateTimeOffset? AcceptedAt);
