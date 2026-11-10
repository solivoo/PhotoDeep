using System.IO.Compression;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.FileProviders;
using BulkImageProcessor.Api.Hubs;
using BulkImageProcessor.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// 1. Configurar Kestrel y Formularios para soportar grandes cargas de archivos
builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = 2147483648; // 2 GB
});

builder.Services.Configure<FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = 2147483648;
    options.ValueLengthLimit = int.MaxValue;
    options.MultipartHeadersLengthLimit = int.MaxValue;
});

// 2. Inyección de dependencias
builder.Services.AddSignalR();
builder.Services.AddSingleton<IImageProcessingService, ImageProcessingService>();

// 3. Habilitar CORS para el frontend en Vite (React)
const string FrontEndCorsPolicy = "FrontEndCorsPolicy";
builder.Services.AddCors(options =>
{
    options.AddPolicy(FrontEndCorsPolicy, policy =>
    {
        policy.WithOrigins("http://localhost:5173", "http://127.0.0.1:5173")
              .AllowAnyMethod()
              .AllowAnyHeader()
              .AllowCredentials();
    });
});

var app = builder.Build();

app.UseCors(FrontEndCorsPolicy);

// 4. Servir archivos estáticos generados en /output_webp
var outputDir = Path.Combine(app.Environment.ContentRootPath, "output_webp");
Directory.CreateDirectory(outputDir);

app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(outputDir),
    RequestPath = "/output_webp"
});

// 5. Mapear el Hub de SignalR
app.MapHub<ProcessingHub>("/hubs/processing");

// 6. Endpoint A: Recibir múltiples archivos y parámetros avanzados
app.MapPost("/api/images/process-upload", async (
    HttpRequest request,
    [FromQuery] int quality,
    [FromQuery] int maxConcurrency,
    [FromQuery] string? connectionId,
    [FromQuery] string? model,
    [FromQuery] bool? enableShadow,
    [FromQuery] float? shadowBlur,
    [FromQuery] float? shadowOffsetY,
    [FromQuery] float? shadowOpacity,
    [FromQuery] float? contrast,
    [FromQuery] float? brightness,
    [FromQuery] int? paddingPercent,
    IImageProcessingService processingService,
    CancellationToken ct) =>
{
    if (!request.HasFormContentType)
        return Results.BadRequest(new { error = "Se esperaba contenido multipart/form-data." });

    var form = await request.ReadFormAsync(ct);
    
    var customBgFile = form.Files.GetFile("customBackground");
    string? perImageConfigsJson = form.TryGetValue("perImageConfigsJson", out var jsonVal) ? jsonVal.ToString() : null;

    var imageFiles = new FormFileCollection();
    foreach (var file in form.Files)
    {
        if (file.Name != "customBackground")
        {
            imageFiles.Add(file);
        }
    }

    if (imageFiles.Count == 0)
        return Results.BadRequest(new { error = "No se enviaron imágenes para procesar." });

    var options = new ProcessingOptions(
        Quality: quality > 0 ? quality : 85,
        MaxConcurrency: maxConcurrency > 0 ? maxConcurrency : 1,
        ConnectionId: connectionId,
        EnableShadow: enableShadow ?? false,
        ShadowBlur: shadowBlur ?? 18f,
        ShadowOffsetY: shadowOffsetY ?? 15f,
        ShadowOpacity: shadowOpacity ?? 0.45f,
        Contrast: contrast ?? 1.0f,
        Brightness: brightness ?? 0f,
        PaddingPercent: paddingPercent ?? 5,
        PerImageConfigsJson: perImageConfigsJson,
        Model: !string.IsNullOrWhiteSpace(model) ? model : "u2netp"
    );

    await processingService.ProcessUploadedFilesAsync(imageFiles, customBgFile, options, ct);

    return Results.Ok(new { message = "Procesamiento masivo finalizado." });
})
.DisableAntiforgery();

// 7. Endpoint B: Descargar lote comprimido en ZIP
app.MapPost("/api/images/download-zip", async (
    [FromBody] DownloadZipRequestDto dto,
    IWebHostEnvironment env) =>
{
    if (dto?.FileNames == null || dto.FileNames.Count == 0)
        return Results.BadRequest(new { error = "No se especificaron archivos para descargar." });

    var targetDir = Path.Combine(env.ContentRootPath, "output_webp");
    var memoryStream = new MemoryStream();

    using (var archive = new ZipArchive(memoryStream, ZipArchiveMode.Create, leaveOpen: true))
    {
        foreach (var rawName in dto.FileNames)
        {
            var fileName = Path.GetFileName(rawName);
            var filePath = Path.Combine(targetDir, fileName);
            if (File.Exists(filePath))
            {
                archive.CreateEntryFromFile(filePath, fileName, CompressionLevel.Fastest);
            }
        }
    }

    memoryStream.Seek(0, SeekOrigin.Begin);
    return Results.File(
        memoryStream,
        "application/zip",
        $"PhotoDeep_WebP_{DateTime.Now:yyyyMMdd_HHmmss}.zip"
    );
});

app.Run("http://localhost:5000");

public record DownloadZipRequestDto(List<string> FileNames);
