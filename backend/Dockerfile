# ─── BUILD aşaması ───
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ["src/Notlar.Api/Notlar.Api.csproj", "src/Notlar.Api/"]
RUN dotnet restore "src/Notlar.Api/Notlar.Api.csproj"
COPY . .
WORKDIR /src/src/Notlar.Api
RUN dotnet publish "Notlar.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# ─── RUNTIME aşaması ───
# v14 — Playwright official .NET image: Chromium + tüm sistem kütüphaneleri + .NET 8 ASP.NET runtime hazır
# Bu image Microsoft tarafından maintained edilir, "playwright install" gerekmiyor
FROM mcr.microsoft.com/playwright/dotnet:v1.49.0-noble
WORKDIR /app
COPY --from=build /app/publish .
ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
EXPOSE 8080
ENTRYPOINT ["dotnet", "Notlar.Api.dll"]
