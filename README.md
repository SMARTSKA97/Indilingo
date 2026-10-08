# Indilingo

Learn Tamil from English, then Telugu, Malayalam, Kannada and Nepali. A Duolingo-style app with a full
A1–B2 Tamil course, spoken Tamil first, a 0–100 Score that maps to CEFR, and offline use on Android.

This repository is the **P0 Foundation** of the phase plan: accounts, roles, the content format, the
web shell and the delivery pipeline. Lessons arrive in P1.

## Layout

| Folder | What it is |
|---|---|
| `web/` | Angular 22 app (standalone components, signals). Also what the Android app wraps. |
| `api/` | ASP.NET Core API (.NET 10, EF Core, Identity). `src/Indilingo.Api`, tests in `tests/`. |
| `db/migrations/` | Flyway SQL migrations. The only way the database changes. |
| `content/` | Course content as JSON: languages, characters, vocabulary, chapters. |
| `tools/` | Content validator and the Android version bump script. |
| `mobile/` | Capacitor Android shell. Version lives in `version.json`. |
| `docs/` | Design notes. |
| `.github/workflows/` | CI, deploy, Android release. |

## Run it locally

You need Docker, .NET 10 SDK and Node 24.

```bash
docker compose up -d db                       # PostgreSQL
docker compose --profile tools run --rm migrate   # apply db/migrations

cd api/src/Indilingo.Api && dotnet run        # http://localhost:5080
cd web && npm ci && npm start                 # http://localhost:4200 (proxies /api to 5080)
```

With no Brevo key, emails (invitations, password resets) are written to the API log instead of sent.

### First admin

Set `Bootstrap__AdminEmail=you@example.com` before the first start. When no admin exists the API sends
that address an admin invitation (or logs the link). Accept it, then you will be asked to turn on
two-factor sign-in, which admin tools require. After that, invite your Tamil reviewer from the Admin page.

## Checks

```bash
cd tools && npm ci && npm test && node validate-content.mjs ../content   # content format
cd web && npx ng test --watch=false && npx ng build                       # web
dotnet test api/Indilingo.slnx                                            # API
```

## Rules the project follows

- **Database:** change it only with a new `V<n>__name.sql` file. Never edit one that has been released.
  CI applies them to an empty database; deploy applies them before the new API starts.
- **Android:** every release bumps the version (the release workflow does it). Add a `## [x.y.z]` section
  to `CHANGELOG.md` first; it becomes the release notes.
- **Roles:** Reviewer and Admin accounts exist only through invitations. Admin tools need two-factor sign-in.
- **Content:** every chapter passes `tools/validate-content.mjs` before merge.

## Configuration

Set these as environment variables on Render (double underscore for nesting).

| Setting | Purpose |
|---|---|
| `ConnectionStrings__Default` | Neon connection string (the `postgresql://` URL works). |
| `Jwt__SigningKey` | 32+ random characters. Keep it secret. |
| `App__WebBaseUrl` | `https://indilingo.ska97homelab.uk` |
| `App__AllowedOrigins__0` … | The site, plus `https://localhost` and `capacitor://localhost` for the Android app. |
| `Brevo__ApiKey`, `Brevo__SenderEmail` | Transactional email. |
| `Bootstrap__AdminEmail` | First admin invitation (see above). |
| `Auth__Google__ClientId` / `ClientSecret` | Same pattern for `Facebook`, `Microsoft`, `GitHub`. A provider shows up only when both are set. |

Redirect addresses to register with each provider: `https://<api-host>/signin-google`, `/signin-facebook`,
`/signin-microsoft`, `/signin-github`.

GitHub Actions secrets: `FLYWAY_URL`, `FLYWAY_USER`, `FLYWAY_PASSWORD`, `RENDER_DEPLOY_HOOK`,
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Variables: `API_URL`, `CLOUDFLARE_PROJECT`.

## Known limits of this drop

- The API was written without a .NET SDK available, so it has **not been compiled or tested**. The first
  `dotnet build` and `dotnet test` may need small fixes. Run them before anything else.
- Social sign-in works in the browser. Inside the Android app it needs a different hand-off, planned for P5.
- The in-app updater and changelog screen are P5. The release pipeline that feeds them is already here.
- Reviewer and admin screens are placeholders until P3.
