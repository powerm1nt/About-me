using Server.Services;
using Shared.Config;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<BlobStorageConfig>(
    builder.Configuration.GetSection(BlobStorageConfig.SectionName));

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
builder.Services.AddMemoryCache(opts => opts.SizeLimit = 50 * 1024 * 1024); // 50 MB cap
builder.Services.AddControllers();

var app = builder.Build();

app.UseCors();
app.UseAuthorization();
app.MapControllers();

app.Run();

