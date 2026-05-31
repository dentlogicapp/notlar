FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ["src/Notlar.Api/Notlar.Api.csproj", "src/Notlar.Api/"]
RUN dotnet restore "src/Notlar.Api/Notlar.Api.csproj"
COPY . .
WORKDIR /src/src/Notlar.Api
RUN dotnet publish "Notlar.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app/publish .
ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080
ENTRYPOINT ["dotnet", "Notlar.Api.dll"]
