using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Indilingo.Api.Data;

/// <summary>
/// Maps to the schema owned by the Flyway migrations in db/migrations. The API never creates or alters tables.
/// </summary>
public class AppDbContext(DbContextOptions<AppDbContext> options)
    : IdentityDbContext<AppUser, AppRole, Guid>(options), IDataProtectionKeyContext
{
    public DbSet<UserProfile> Profiles => Set<UserProfile>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<Invite> Invites => Set<Invite>();
    public DbSet<DataProtectionKey> DataProtectionKeys => Set<DataProtectionKey>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<AppUser>().ToTable("users");
        builder.Entity<AppRole>().ToTable("roles");
        builder.Entity<IdentityUserRole<Guid>>().ToTable("user_roles");
        builder.Entity<IdentityUserClaim<Guid>>().ToTable("user_claims");
        builder.Entity<IdentityUserLogin<Guid>>().ToTable("user_logins");
        builder.Entity<IdentityRoleClaim<Guid>>().ToTable("role_claims");
        builder.Entity<IdentityUserToken<Guid>>().ToTable("user_tokens");

        builder.Entity<UserProfile>(e =>
        {
            e.ToTable("user_profiles");
            e.HasKey(p => p.UserId);
            e.HasOne<AppUser>().WithOne().HasForeignKey<UserProfile>(p => p.UserId).OnDelete(DeleteBehavior.Cascade);
            e.Property(p => p.DisplayName).HasMaxLength(40);
            e.Property(p => p.CountryCode).HasMaxLength(2).IsFixedLength();
            e.Property(p => p.LearnerProfile).HasMaxLength(40);
            e.Property(p => p.TimeZone).HasMaxLength(64);
        });

        builder.Entity<RefreshToken>(e =>
        {
            e.ToTable("refresh_tokens");
            e.HasKey(t => t.Id);
            e.HasIndex(t => t.TokenHash).IsUnique();
            e.HasOne<AppUser>().WithMany().HasForeignKey(t => t.UserId).OnDelete(DeleteBehavior.Cascade);
            e.Property(t => t.TokenHash).HasMaxLength(64);
        });

        builder.Entity<Invite>(e =>
        {
            e.ToTable("invites");
            e.HasKey(i => i.Id);
            e.HasIndex(i => i.TokenHash).IsUnique();
            e.Property(i => i.Email).HasMaxLength(256);
            e.Property(i => i.RoleName).HasMaxLength(32);
            e.Property(i => i.TokenHash).HasMaxLength(64);
        });

        builder.Entity<DataProtectionKey>().ToTable("data_protection_keys");

        ApplySnakeCase(builder);
    }

    private static void ApplySnakeCase(ModelBuilder builder)
    {
        foreach (var entity in builder.Model.GetEntityTypes())
        {
            foreach (var property in entity.GetProperties())
            {
                property.SetColumnName(ToSnakeCase(property.Name));
            }
        }
    }

    public static string ToSnakeCase(string name)
    {
        var sb = new System.Text.StringBuilder(name.Length + 4);
        for (var i = 0; i < name.Length; i++)
        {
            var c = name[i];
            if (char.IsUpper(c))
            {
                if (i > 0 && (char.IsLower(name[i - 1]) || char.IsDigit(name[i - 1]))) sb.Append('_');
                sb.Append(char.ToLowerInvariant(c));
            }
            else
            {
                sb.Append(c);
            }
        }
        return sb.ToString();
    }
}

/// <summary>Lets tests swap the database provider without touching production wiring.</summary>
public sealed class DatabaseConfigurator(Action<DbContextOptionsBuilder> configure)
{
    public void Configure(DbContextOptionsBuilder options) => configure(options);
}
