using Server.Services;
using Shared.Config;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<BlobStorageConfig>(
    builder.Configuration.GetSection(BlobStorageConfig.SectionName));
builder.Services.Configure<GitHubConfig>(
    builder.Configuration.GetSection(GitHubConfig.SectionName));

var allowedOrigins = builder.Configuration
    .GetSection("Cors:AllowedOrigins")
    .Get<string[]>() ?? [];

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins(allowedOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod());
});

builder.Services.AddSingleton<BlobStorageService>();
builder.Services.AddSingleton<AuthSessionStore>();
builder.Services.AddSingleton<DiffService>();
builder.Services.AddSingleton<GitHubProposalService>();
builder.Services.AddSingleton<PageContentCache>();
builder.Services.AddHttpClient();
builder.Services.AddMemoryCache(opts => opts.SizeLimit = 10_000); // auth session/state cache
builder.Services.AddControllers();

var app = builder.Build();

app.UseCors();
app.UseAuthorization();
app.MapControllers();

app.Run();

