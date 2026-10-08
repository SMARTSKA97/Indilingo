using System.Text;
using System.Threading.RateLimiting;
using Indilingo.Api.Auth;
using Indilingo.Api.Contracts;
using Indilingo.Api.Data;
using Indilingo.Api.Options;
using Indilingo.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace Indilingo.Api;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddIndilingo(this IServiceCollection services, IConfiguration config)
    {
        services.AddOptions<JwtOptions>()
            .Bind(config.GetSection(JwtOptions.Section))
            .Validate(o => o.SigningKey.Length >= 32, "Jwt:SigningKey must be set to at least 32 characters.")
            .ValidateOnStart();
        services.Configure<AppOptions>(config.GetSection(AppOptions.Section));
        services.Configure<BrevoOptions>(config.GetSection(BrevoOptions.Section));
        services.Configure<BootstrapOptions>(config.GetSection(BootstrapOptions.Section));

        services.AddSingleton(TimeProvider.System);
        services.AddHttpContextAccessor();

        services.AddDbContext<AppDbContext>((sp, options) =>
        {
            var custom = sp.GetService<DatabaseConfigurator>();
            if (custom is not null)
            {
                custom.Configure(options);
                return;
            }
            options.UseNpgsql(ConnectionStrings.Normalize(config.GetConnectionString("Default") ?? ""));
        });
        services.AddDataProtection()
            .SetApplicationName("Indilingo")
            .PersistKeysToDbContext<AppDbContext>();

        services.AddIdentityCore<AppUser>(o =>
            {
                // Email uniqueness is enforced through the user name, which holds the email.
                // Guest accounts have no email yet, so Identity's own email check must stay off.
                o.User.RequireUniqueEmail = false;
                o.Password.RequiredLength = 8;
                o.Password.RequireDigit = false;
                o.Password.RequireLowercase = false;
                o.Password.RequireUppercase = false;
                o.Password.RequireNonAlphanumeric = false;
                o.Lockout.MaxFailedAccessAttempts = 5;
                o.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
                o.Lockout.AllowedForNewUsers = true;
                o.Stores.SchemaVersion = IdentitySchemaVersions.Version2;
            })
            .AddRoles<AppRole>()
            .AddEntityFrameworkStores<AppDbContext>()
            .AddDefaultTokenProviders();

        services.AddScoped<TokenService>();
        services.AddScoped<SessionService>();
        services.AddScoped<InviteService>();
        services.AddScoped<ExternalLoginService>();
        services.AddSingleton<ExternalCodeStore>();

        var brevo = config.GetSection(BrevoOptions.Section).Get<BrevoOptions>() ?? new BrevoOptions();
        if (brevo.IsConfigured)
        {
            services.AddHttpClient<IEmailSender, BrevoEmailSender>(c => c.Timeout = TimeSpan.FromSeconds(15));
        }
        else
        {
            services.AddSingleton<IEmailSender, LoggingEmailSender>();
        }

        services.AddHostedService<BootstrapAdminService>();
        services.AddHostedService<CleanupService>();

        services.AddIndilingoAuthentication(config);
        services.AddAuthorizationBuilder()
            .AddPolicy(Policies.AdminTwoFactor, p => p
                .RequireAuthenticatedUser()
                .AddRequirements(new AdminWithTwoFactorRequirement()));
        services.AddScoped<IAuthorizationHandler, AdminWithTwoFactorHandler>();

        var origins = config.GetSection($"{AppOptions.Section}:AllowedOrigins").Get<string[]>() ?? [];
        services.AddCors(o => o.AddDefaultPolicy(p => p
            .WithOrigins(origins)
            .AllowAnyHeader()
            .AllowAnyMethod()));

        services.AddIndilingoRateLimiting(config);

        services.Configure<ForwardedHeadersOptions>(o =>
        {
            // Render and Cloudflare sit in front of the API; trust their forwarded address and scheme.
            o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            o.KnownNetworks.Clear();
            o.KnownProxies.Clear();
        });
        return services;
    }

    private static void AddIndilingoAuthentication(this IServiceCollection services, IConfiguration config)
    {
        var jwt = config.GetSection(JwtOptions.Section).Get<JwtOptions>() ?? new JwtOptions();

        var auth = services.AddAuthentication(o =>
            {
                o.DefaultScheme = JwtBearerDefaults.AuthenticationScheme;
                o.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
                o.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
                o.DefaultSignInScheme = IdentityConstants.ExternalScheme;
            })
            .AddJwtBearer(o =>
            {
                o.MapInboundClaims = false;
                o.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = jwt.Issuer,
                    ValidateAudience = true,
                    ValidAudience = jwt.Audience,
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.SigningKey)),
                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.FromSeconds(30),
                    NameClaimType = "name",
                    RoleClaimType = "role",
                };
            })
            // Short-lived cookie that carries the provider's answer from the callback to our own handler.
            .AddCookie(IdentityConstants.ExternalScheme, o =>
            {
                o.Cookie.Name = "Indilingo.External";
                o.Cookie.SameSite = SameSiteMode.Lax;
                o.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
                o.ExpireTimeSpan = TimeSpan.FromMinutes(10);
            });

        if (ExternalProviders.IsConfigured(config, "google"))
        {
            auth.AddGoogle(o =>
            {
                o.ClientId = config["Auth:Google:ClientId"]!;
                o.ClientSecret = config["Auth:Google:ClientSecret"]!;
                o.SignInScheme = IdentityConstants.ExternalScheme;
            });
        }
        if (ExternalProviders.IsConfigured(config, "facebook"))
        {
            auth.AddFacebook(o =>
            {
                o.ClientId = config["Auth:Facebook:ClientId"]!;
                o.ClientSecret = config["Auth:Facebook:ClientSecret"]!;
                o.SignInScheme = IdentityConstants.ExternalScheme;
            });
        }
        if (ExternalProviders.IsConfigured(config, "microsoft"))
        {
            auth.AddMicrosoftAccount(o =>
            {
                o.ClientId = config["Auth:Microsoft:ClientId"]!;
                o.ClientSecret = config["Auth:Microsoft:ClientSecret"]!;
                o.SignInScheme = IdentityConstants.ExternalScheme;
            });
        }
        if (ExternalProviders.IsConfigured(config, "github"))
        {
            auth.AddGitHub(o =>
            {
                o.ClientId = config["Auth:GitHub:ClientId"]!;
                o.ClientSecret = config["Auth:GitHub:ClientSecret"]!;
                o.Scope.Add("user:email");
                o.SignInScheme = IdentityConstants.ExternalScheme;
            });
        }
    }

    private static void AddIndilingoRateLimiting(this IServiceCollection services, IConfiguration config)
    {
        var perMinute = config.GetValue("RateLimit:AuthPerMinute", 30);
        var guestsPerHour = config.GetValue("RateLimit:GuestPerHour", 20);

        services.AddRateLimiter(o =>
        {
            o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            o.OnRejected = async (context, token) =>
            {
                context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
                await context.HttpContext.Response.WriteAsJsonAsync(
                    new ApiError("rate_limited", "Too many attempts. Please wait a minute and try again."), token);
            };
            o.AddPolicy("auth", http => RateLimitPartition.GetFixedWindowLimiter(
                http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = perMinute,
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0,
                }));
            o.AddPolicy("guest", http => RateLimitPartition.GetFixedWindowLimiter(
                http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = guestsPerHour,
                    Window = TimeSpan.FromHours(1),
                    QueueLimit = 0,
                }));
        });
    }

    public static WebApplication UseIndilingo(this WebApplication app)
    {
        app.UseForwardedHeaders();
        app.UseExceptionHandler(errors => errors.Run(async context =>
        {
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            await context.Response.WriteAsJsonAsync(new ApiError("server_error", "Something went wrong on our side."));
        }));
        app.UseCors();
        app.UseAuthentication();
        app.UseRateLimiter();
        app.UseAuthorization();

        app.MapHealth();
        app.MapAuth();
        app.MapAdmin();
        return app;
    }
}
