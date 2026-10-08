# Build context is the api/ folder.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY global.json Directory.Build.props Indilingo.slnx ./
COPY src/Indilingo.Api/Indilingo.Api.csproj src/Indilingo.Api/
RUN dotnet restore src/Indilingo.Api/Indilingo.Api.csproj
COPY src/ src/
RUN dotnet publish src/Indilingo.Api/Indilingo.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS run
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_URLS=http://+:8080 \
    DOTNET_gcServer=0 \
    DOTNET_GCHeapHardLimitPercent=70
EXPOSE 8080
USER $APP_UID
ENTRYPOINT ["dotnet", "Indilingo.Api.dll"]
