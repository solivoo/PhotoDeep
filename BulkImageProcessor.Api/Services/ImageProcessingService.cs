using System.Diagnostics;
using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using SkiaSharp;
using BulkImageProcessor.Api.Hubs;

namespace BulkImageProcessor.Api.Services;

public record ImageEffectConfig(
    bool? EnableShadow = null,
    float? ShadowBlur = null,
    float? ShadowOffsetY = null,
    float? ShadowOpacity = null,
    float? Contrast = null,
    float? Brightness = null,
    int? PaddingPercent = null,
    int? Quality = null
);

public record ProcessingOptions(
    int Quality = 85,
    int MaxConcurrency = 1,
    string? ConnectionId = null,
    string? CustomBackgroundPath = null,
    bool EnableShadow = false,
    float ShadowBlur = 18f,
    float ShadowOffsetY = 15f,
    float ShadowOpacity = 0.45f,
    float Contrast = 1.0f,
    float Brightness = 0f,
    int PaddingPercent = 5,
    string? PerImageConfigsJson = null,
    string Model = "u2netp"
);

public record ImageResultDto(
    string OriginalFileName,
    string WebpFileName,
    string Url,
    long SizeBytes
);

public record ProgressUpdateDto(
    int Current,
    int Total,
    int Succeeded,
    int Failed,
    string CurrentFileName,
    string StatusMessage
);

public interface IImageProcessingService
{
    Task ProcessUploadedFilesAsync(IFormFileCollection files, IFormFile? customBackground, ProcessingOptions options, CancellationToken ct);
}

public class ImageProcessingService : IImageProcessingService
{
    private readonly IHubContext<ProcessingHub> _hubContext;
    private readonly ILogger<ImageProcessingService> _logger;
    private readonly string _tempInputDir;
    private readonly string _outputWebpDir;

    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg", ".jpeg", ".png", ".webp"
    };

    public ImageProcessingService(
        IHubContext<ProcessingHub> hubContext,
        ILogger<ImageProcessingService> logger,
        IWebHostEnvironment env)
    {
        _hubContext = hubContext;
        _logger = logger;

        _tempInputDir = Path.Combine(env.ContentRootPath, "temp_input");
        _outputWebpDir = Path.Combine(env.ContentRootPath, "output_webp");

        Directory.CreateDirectory(_tempInputDir);
        Directory.CreateDirectory(_outputWebpDir);
    }

    public async Task ProcessUploadedFilesAsync(
        IFormFileCollection files,
        IFormFile? customBackground,
        ProcessingOptions options,
        CancellationToken ct)
    {
        string? tempBgPath = null;

        try
        {
            if (customBackground != null && customBackground.Length > 0)
            {
                var bgExt = Path.GetExtension(customBackground.FileName);
                tempBgPath = Path.Combine(_tempInputDir, $"bg_{Guid.NewGuid():N}{bgExt}");
                await using var bgStream = new FileStream(tempBgPath, FileMode.Create, FileAccess.Write, FileShare.None, 81920, useAsync: true);
                await customBackground.CopyToAsync(bgStream, ct);

                options = options with { CustomBackgroundPath = tempBgPath };
            }

            var validFiles = files
                .Where(f => AllowedExtensions.Contains(Path.GetExtension(f.FileName)))
                .ToList();

            var savedTempFiles = new List<(string TempInputPath, string OriginalName)>();

            foreach (var file in validFiles)
            {
                var uniqueId = Guid.NewGuid().ToString("N");
                var ext = Path.GetExtension(file.FileName);
                var tempFilePath = Path.Combine(_tempInputDir, $"{uniqueId}_in{ext}");

                await using var stream = new FileStream(tempFilePath, FileMode.Create, FileAccess.Write, FileShare.None, 81920, useAsync: true);
                await file.CopyToAsync(stream, ct);

                savedTempFiles.Add((tempFilePath, file.FileName));
            }

            await ExecuteBulkPipelineAsync(savedTempFiles, deleteInputAfterProcess: true, options, ct);
        }
        finally
        {
            if (!string.IsNullOrEmpty(tempBgPath))
            {
                SafeDeleteFile(tempBgPath);
            }
        }
    }

    private async Task ExecuteBulkPipelineAsync(
        List<(string TempInputPath, string OriginalName)> items,
        bool deleteInputAfterProcess,
        ProcessingOptions options,
        CancellationToken ct)
    {
        int total = items.Count;
        if (total == 0)
        {
            await NotifyClientAsync(options.ConnectionId, "ReceiveBatchCompleted", new
            {
                Total = 0,
                Succeeded = 0,
                Failed = 0,
                Message = "No se encontraron imágenes válidas (.jpg, .jpeg, .png, .webp)."
            });
            return;
        }

        Dictionary<string, ImageEffectConfig> perImageConfigs = new(StringComparer.OrdinalIgnoreCase);
        if (!string.IsNullOrWhiteSpace(options.PerImageConfigsJson))
        {
            try
            {
                var parsed = JsonSerializer.Deserialize<Dictionary<string, ImageEffectConfig>>(
                    options.PerImageConfigsJson,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true }
                );
                if (parsed != null)
                {
                    perImageConfigs = new Dictionary<string, ImageEffectConfig>(parsed, StringComparer.OrdinalIgnoreCase);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "No se pudo deserializar perImageConfigsJson, usando ajustes globales.");
            }
        }

        int processedCount = 0;
        int succeededCount = 0;
        int failedCount = 0;

        int defaultQuality = Math.Clamp(options.Quality, 1, 100);
        int maxConcurrency = Math.Clamp(options.MaxConcurrency, 1, Environment.ProcessorCount * 2);

        var parallelOptions = new ParallelOptions
        {
            MaxDegreeOfParallelism = maxConcurrency,
            CancellationToken = ct
        };

        _logger.LogInformation("Iniciando pipeline de {Total} imágenes. Concurrencia: {Concurrency}, Calidad: {Quality}, Sombra: {Shadow}, Contraste: {Contrast}",
            total, maxConcurrency, defaultQuality, options.EnableShadow, options.Contrast);

        await Parallel.ForEachAsync(items, parallelOptions, async (item, token) =>
        {
            string uniqueRunId = Guid.NewGuid().ToString("N");
            string workingInputPath = item.TempInputPath;
            string tempPngOutputPath = Path.Combine(_tempInputDir, $"{uniqueRunId}_nobg.png");

            // Merge de opciones por imagen vs globales
            perImageConfigs.TryGetValue(item.OriginalName, out var imageCfg);
            bool enableShadow = imageCfg?.EnableShadow ?? options.EnableShadow;
            float shadowBlur = imageCfg?.ShadowBlur ?? options.ShadowBlur;
            float shadowOffsetY = imageCfg?.ShadowOffsetY ?? options.ShadowOffsetY;
            float shadowOpacity = imageCfg?.ShadowOpacity ?? options.ShadowOpacity;
            float contrast = imageCfg?.Contrast ?? options.Contrast;
            float brightness = imageCfg?.Brightness ?? options.Brightness;
            int paddingPercent = imageCfg?.PaddingPercent ?? options.PaddingPercent;
            int quality = imageCfg?.Quality.HasValue == true ? Math.Clamp(imageCfg.Quality.Value, 1, 100) : defaultQuality;

            try
            {
                int currentStep = Volatile.Read(ref processedCount) + 1;
                await NotifyClientAsync(options.ConnectionId, "ReceiveProgress", new ProgressUpdateDto(
                    Current: currentStep,
                    Total: total,
                    Succeeded: Volatile.Read(ref succeededCount),
                    Failed: Volatile.Read(ref failedCount),
                    CurrentFileName: item.OriginalName,
                    StatusMessage: $"Eliminando fondo de {item.OriginalName} ({currentStep}/{total})..."
                ));

                if (!deleteInputAfterProcess)
                {
                    var ext = Path.GetExtension(item.OriginalName);
                    workingInputPath = Path.Combine(_tempInputDir, $"{uniqueRunId}_local{ext}");
                    File.Copy(item.TempInputPath, workingInputPath, overwrite: true);
                }

                // 1. Invocar CLI rembg con el modelo seleccionado (u2netp por defecto para velocidad extrema)
                await RunRembgProcessAsync(workingInputPath, tempPngOutputPath, options.Model, token);

                await NotifyClientAsync(options.ConnectionId, "ReceiveProgress", new ProgressUpdateDto(
                    Current: currentStep,
                    Total: total,
                    Succeeded: Volatile.Read(ref succeededCount),
                    Failed: Volatile.Read(ref failedCount),
                    CurrentFileName: item.OriginalName,
                    StatusMessage: $"Aplicando efectos y convirtiendo a WebP..."
                ));

                // 2. Nombre final WebP
                string baseName = Path.GetFileNameWithoutExtension(item.OriginalName);
                string finalWebpFileName = $"{baseName}_{uniqueRunId[..6]}.webp";
                string finalWebpPath = Path.Combine(_outputWebpDir, finalWebpFileName);

                // 3. Convertir a WebP con efectos avanzados
                long outputSizeBytes = ConvertPngToWebp(
                    tempPngOutputPath,
                    finalWebpPath,
                    quality,
                    options.CustomBackgroundPath,
                    enableShadow,
                    shadowBlur,
                    shadowOffsetY,
                    shadowOpacity,
                    contrast,
                    brightness,
                    paddingPercent
                );

                int currentSuccess = Interlocked.Increment(ref succeededCount);
                int currentProcessed = Interlocked.Increment(ref processedCount);

                var resultDto = new ImageResultDto(
                    OriginalFileName: item.OriginalName,
                    WebpFileName: finalWebpFileName,
                    Url: $"/output_webp/{finalWebpFileName}",
                    SizeBytes: outputSizeBytes
                );

                await NotifyClientAsync(options.ConnectionId, "ReceiveImageCompleted", resultDto);

                await NotifyClientAsync(options.ConnectionId, "ReceiveProgress", new ProgressUpdateDto(
                    Current: currentProcessed,
                    Total: total,
                    Succeeded: currentSuccess,
                    Failed: Volatile.Read(ref failedCount),
                    CurrentFileName: item.OriginalName,
                    StatusMessage: $"Completada {item.OriginalName} ({currentProcessed} de {total})"
                ));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al procesar la imagen {FileName}", item.OriginalName);

                int currentFail = Interlocked.Increment(ref failedCount);
                int currentProcessed = Interlocked.Increment(ref processedCount);

                await NotifyClientAsync(options.ConnectionId, "ReceiveImageError", new
                {
                    FileName = item.OriginalName,
                    ErrorMessage = ex.Message
                });

                await NotifyClientAsync(options.ConnectionId, "ReceiveProgress", new ProgressUpdateDto(
                    Current: currentProcessed,
                    Total: total,
                    Succeeded: Volatile.Read(ref succeededCount),
                    Failed: currentFail,
                    CurrentFileName: item.OriginalName,
                    StatusMessage: $"Error en {item.OriginalName} ({currentProcessed} de {total})"
                ));
            }
            finally
            {
                SafeDeleteFile(workingInputPath);
                SafeDeleteFile(tempPngOutputPath);
            }
        });

        await NotifyClientAsync(options.ConnectionId, "ReceiveBatchCompleted", new
        {
            Total = total,
            Succeeded = succeededCount,
            Failed = failedCount,
            Message = $"Completado: {succeededCount} exitosas, {failedCount} con errores."
        });
    }

    private static string ResolveRembgExecutable()
    {
        var candidates = new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".local", "bin", "rembg"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".local", "share", "mise", "installs", "python", "latest", "bin", "rembg"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".local", "share", "mise", "shims", "rembg"),
            "/usr/local/bin/rembg",
            "/usr/bin/rembg"
        };

        foreach (var path in candidates)
        {
            if (File.Exists(path))
            {
                return path;
            }
        }

        return "rembg";
    }

    private static async Task RunRembgProcessAsync(string inputPath, string outputPngPath, string modelName, CancellationToken ct)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = ResolveRembgExecutable(),
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        startInfo.ArgumentList.Add("i");
        startInfo.ArgumentList.Add("-m");
        startInfo.ArgumentList.Add(string.IsNullOrWhiteSpace(modelName) ? "u2netp" : modelName.Trim());
        startInfo.ArgumentList.Add(inputPath);
        startInfo.ArgumentList.Add(outputPngPath);

        using var process = new Process { StartInfo = startInfo };

        if (!process.Start())
            throw new InvalidOperationException("No se pudo iniciar el proceso 'rembg'.");

        var stdOutTask = process.StandardOutput.ReadToEndAsync(ct);
        var stdErrTask = process.StandardError.ReadToEndAsync(ct);

        await process.WaitForExitAsync(ct);

        string stdErr = await stdErrTask;
        _ = await stdOutTask;

        if (process.ExitCode != 0)
        {
            throw new ApplicationException($"rembg falló (ExitCode {process.ExitCode}): {stdErr}");
        }

        if (!File.Exists(outputPngPath))
        {
            throw new FileNotFoundException("rembg finalizó pero no generó el archivo PNG de salida.", outputPngPath);
        }
    }

    private static long ConvertPngToWebp(
        string inputPngPath,
        string outputWebpPath,
        int quality,
        string? customBackgroundPath,
        bool enableShadow,
        float shadowBlur,
        float shadowOffsetY,
        float shadowOpacity,
        float contrast,
        float brightness,
        int paddingPercent)
    {
        using var foregroundStream = File.OpenRead(inputPngPath);
        using var foregroundBitmap = SKBitmap.Decode(foregroundStream);

        if (foregroundBitmap is null)
            throw new InvalidDataException("SkiaSharp no pudo decodificar el PNG generado por rembg.");

        int targetW = foregroundBitmap.Width;
        int targetH = foregroundBitmap.Height;

        // Lienzo maestro de alta precisión
        using var canvasBitmap = new SKBitmap(targetW, targetH, SKColorType.Rgba8888, SKAlphaType.Premul);
        using var canvas = new SKCanvas(canvasBitmap);
        canvas.Clear(SKColors.Transparent);

        var sampling = new SKSamplingOptions(SKFilterMode.Linear, SKMipmapMode.Linear);

        // 1. Dibujar fondo si se especificó (en modo cover para llenar todo el lienzo sin márgenes)
        if (!string.IsNullOrEmpty(customBackgroundPath) && File.Exists(customBackgroundPath))
        {
            using var bgStream = File.OpenRead(customBackgroundPath);
            using var bgBitmap = SKBitmap.Decode(bgStream);

            if (bgBitmap != null)
            {
                float scale = Math.Max((float)targetW / bgBitmap.Width, (float)targetH / bgBitmap.Height);
                float scaledW = bgBitmap.Width * scale;
                float scaledH = bgBitmap.Height * scale;
                float left = (targetW - scaledW) / 2f;
                float top = (targetH - scaledH) / 2f;

                var bgDestRect = new SKRect(left, top, left + scaledW, top + scaledH);
                using var bgImage = SKImage.FromBitmap(bgBitmap);
                canvas.DrawImage(bgImage, bgDestRect, sampling);
            }
        }

        // 2. Padding/Margen para que el producto no quede pegado a los bordes
        int clampedPadding = Math.Clamp(paddingPercent, 0, 40);
        float padX = targetW * (clampedPadding / 100f);
        float padY = targetH * (clampedPadding / 100f);
        float availW = targetW - (padX * 2);
        float availH = targetH - (padY * 2);

        float fgScale = Math.Min(availW / foregroundBitmap.Width, availH / foregroundBitmap.Height);
        float fgScaledW = foregroundBitmap.Width * fgScale;
        float fgScaledH = foregroundBitmap.Height * fgScale;
        float fgLeft = padX + (availW - fgScaledW) / 2f;
        float fgTop = padY + (availH - fgScaledH) / 2f;

        var fgDestRect = new SKRect(fgLeft, fgTop, fgLeft + fgScaledW, fgTop + fgScaledH);

        // 3. Pintura con efectos (Sombra proyectada y Contraste / Brillo)
        using var fgPaint = new SKPaint();
        fgPaint.IsAntialias = true;

        if (enableShadow && shadowOpacity > 0.01f)
        {
            byte alpha = (byte)Math.Clamp((int)(shadowOpacity * 255f), 0, 255);
            var shadowColor = new SKColor(0, 0, 0, alpha);
            fgPaint.ImageFilter = SKImageFilter.CreateDropShadow(
                dx: 0,
                dy: shadowOffsetY,
                sigmaX: shadowBlur,
                sigmaY: shadowBlur,
                color: shadowColor
            );
        }

        if (Math.Abs(contrast - 1.0f) > 0.01f || Math.Abs(brightness) > 0.01f)
        {
            float c = Math.Clamp(contrast, 0.2f, 2.5f);
            float b = Math.Clamp(brightness, -100f, 100f);
            float t = (1.0f - c) / 2.0f * 255.0f + b;
            float[] matrix = new float[]
            {
                c, 0, 0, 0, t,
                0, c, 0, 0, t,
                0, 0, c, 0, t,
                0, 0, 0, 1, 0
            };
            fgPaint.ColorFilter = SKColorFilter.CreateColorMatrix(matrix);
        }

        // 4. Dibujar producto
        using var fgImage = SKImage.FromBitmap(foregroundBitmap);
        canvas.DrawImage(fgImage, fgDestRect, sampling, fgPaint);

        // 5. Codificar a WebP optimizado
        using var finalImage = SKImage.FromBitmap(canvasBitmap);
        using var encodedData = finalImage.Encode(SKEncodedImageFormat.Webp, quality);

        if (encodedData is null)
            throw new InvalidOperationException("SkiaSharp falló al codificar la imagen a formato WebP.");

        using var outputStream = new FileStream(outputWebpPath, FileMode.Create, FileAccess.Write, FileShare.None);
        encodedData.SaveTo(outputStream);

        return outputStream.Length;
    }

    private async Task NotifyClientAsync(string? connectionId, string method, object arg)
    {
        try
        {
            if (!string.IsNullOrEmpty(connectionId))
            {
                await _hubContext.Clients.Client(connectionId).SendAsync(method, arg);
            }
            else
            {
                await _hubContext.Clients.All.SendAsync(method, arg);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error al enviar notificación SignalR '{Method}' al cliente {ConnectionId}", method, connectionId);
        }
    }

    private static void SafeDeleteFile(string path)
    {
        try
        {
            if (File.Exists(path)) File.Delete(path);
        }
        catch
        {
            // Ignorar fallos de limpieza temporal
        }
    }
}
