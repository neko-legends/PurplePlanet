using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace LivelyLite;

internal enum WallpaperKind
{
    App = 0,
    Web = 1,
    WebAudio = 2,
    Url = 3,
    Bizhawk = 4,
    Unity = 5,
    Godot = 6,
    Video = 7,
    Gif = 8,
    UnityAudio = 9,
    VideoStream = 10,
    Picture = 11,
    Unknown = -1
}

internal sealed class LivelyAsset
{
    public required string RootDirectory { get; init; }
    public required LivelyInfo Info { get; init; }
    public required WallpaperKind Kind { get; init; }

    public string Title => string.IsNullOrWhiteSpace(Info.Title)
        ? Path.GetFileName(RootDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar))
        : Info.Title!;

    public bool RequiresHttpServer => Kind is WallpaperKind.Web or WallpaperKind.WebAudio;

    public static LivelyAsset Load(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
            throw new InvalidOperationException("No wallpaperPath is configured.");

        path = ExpandPath(path);

        if (IsHttpUrl(path))
        {
            return new LivelyAsset
            {
                RootDirectory = Directory.GetCurrentDirectory(),
                Kind = WallpaperKind.Url,
                Info = new LivelyInfo { Title = "Web wallpaper", FileName = path, Type = JsonDocument.Parse("\"url\"").RootElement.Clone() }
            };
        }

        if (File.Exists(path) && IsPackage(path))
            path = ExtractPackage(path);

        if (Directory.Exists(path))
            return LoadDirectory(path);

        if (File.Exists(path))
            return LoadFile(path);

        throw new FileNotFoundException("Wallpaper path was not found.", path);
    }

    public string GetLaunchUrl(AppConfig config, StaticFileServer? staticFileServer = null)
    {
        return Kind switch
        {
            WallpaperKind.Web or WallpaperKind.WebAudio => AppendQuery(
                staticFileServer is null
                    ? ToFileUri(ResolveAssetFile())
                    : staticFileServer.GetUrl(ResolveAssetFile()),
                config.QueryString),
            WallpaperKind.Url or WallpaperKind.VideoStream => AppendQuery(Info.FileName ?? "", config.QueryString),
            WallpaperKind.Picture or WallpaperKind.Gif or WallpaperKind.Video => MediaWrapper.GetUrl(ResolveAssetFile(), Kind),
            _ => throw new NotSupportedException($"LivelyLite does not support '{Kind}' wallpapers.")
        };
    }

    public bool IsSupported =>
        Kind is WallpaperKind.Web or WallpaperKind.WebAudio or WallpaperKind.Url or
            WallpaperKind.Picture or WallpaperKind.Gif or WallpaperKind.Video or WallpaperKind.VideoStream;

    private string ResolveAssetFile()
    {
        if (string.IsNullOrWhiteSpace(Info.FileName))
            throw new InvalidOperationException("LivelyInfo.json does not specify FileName.");

        if (Kind is WallpaperKind.Url or WallpaperKind.VideoStream && IsHttpUrl(Info.FileName))
            return Info.FileName;

        return Info.IsAbsolutePath
            ? ExpandPath(Info.FileName)
            : Path.GetFullPath(Path.Combine(RootDirectory, Info.FileName));
    }

    private static LivelyAsset LoadDirectory(string directory)
    {
        var root = FindAssetRoot(directory);
        var infoPath = Path.Combine(root, "LivelyInfo.json");
        if (File.Exists(infoPath))
        {
            var info = JsonSerializer.Deserialize<LivelyInfo>(File.ReadAllText(infoPath), JsonOptions())
                ?? throw new InvalidOperationException("LivelyInfo.json could not be parsed.");
            return new LivelyAsset { RootDirectory = root, Info = info, Kind = info.GetKind() };
        }

        var entry = File.Exists(Path.Combine(root, "wallpaper.html"))
            ? "wallpaper.html"
            : File.Exists(Path.Combine(root, "index.html"))
                ? "index.html"
                : throw new InvalidOperationException("Directory does not contain LivelyInfo.json, wallpaper.html, or index.html.");

        return new LivelyAsset
        {
            RootDirectory = root,
            Kind = WallpaperKind.Web,
            Info = new LivelyInfo
            {
                Title = Path.GetFileName(root),
                FileName = entry,
                Type = JsonDocument.Parse("\"web\"").RootElement.Clone()
            }
        };
    }

    private static LivelyAsset LoadFile(string file)
    {
        var kind = ExtensionToKind(Path.GetExtension(file));
        if (kind == WallpaperKind.Unknown)
            throw new NotSupportedException($"Unsupported wallpaper file extension: {Path.GetExtension(file)}");

        return new LivelyAsset
        {
            RootDirectory = Path.GetDirectoryName(file)!,
            Kind = kind,
            Info = new LivelyInfo
            {
                Title = Path.GetFileNameWithoutExtension(file),
                FileName = file,
                IsAbsolutePath = true,
                Type = JsonDocument.Parse($"\"{kind.ToString().ToLowerInvariant()}\"").RootElement.Clone()
            }
        };
    }

    private static WallpaperKind ExtensionToKind(string ext)
    {
        ext = ext.ToLowerInvariant();
        if (ext is ".html" or ".htm")
            return WallpaperKind.Web;
        if (ext is ".jpg" or ".jpeg" or ".png" or ".bmp" or ".webp" or ".tif" or ".tiff" or ".jfif")
            return WallpaperKind.Picture;
        if (ext == ".gif")
            return WallpaperKind.Gif;
        if (ext is ".mp4" or ".m4v" or ".mov" or ".webm" or ".mkv" or ".avi" or ".wmv" or ".ogv")
            return WallpaperKind.Video;
        return WallpaperKind.Unknown;
    }

    private static string FindAssetRoot(string directory)
    {
        if (File.Exists(Path.Combine(directory, "LivelyInfo.json")))
            return Path.GetFullPath(directory);

        var matches = Directory.GetFiles(directory, "LivelyInfo.json", SearchOption.AllDirectories);
        if (matches.Length == 1)
            return Path.GetDirectoryName(matches[0])!;

        return Path.GetFullPath(directory);
    }

    private static bool IsPackage(string path)
    {
        var ext = Path.GetExtension(path);
        return ext.Equals(".zip", StringComparison.OrdinalIgnoreCase) ||
            ext.Equals(".lively", StringComparison.OrdinalIgnoreCase);
    }

    private static string ExtractPackage(string packagePath)
    {
        var package = new FileInfo(packagePath);
        var hashInput = $"{package.FullName}|{package.Length}|{package.LastWriteTimeUtc.Ticks}";
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(hashInput)))[..12].ToLowerInvariant();
        var baseName = Path.GetFileNameWithoutExtension(package.Name);
        var output = Path.Combine(AppPaths.PackageCache, $"{SanitizeFileName(baseName)}-{hash}");

        if (File.Exists(Path.Combine(FindAssetRootIfExists(output) ?? output, "LivelyInfo.json")))
            return output;

        if (Directory.Exists(output))
            Directory.Delete(output, true);
        Directory.CreateDirectory(output);

        using var archive = ZipFile.OpenRead(packagePath);
        var outputRoot = Path.GetFullPath(output) + Path.DirectorySeparatorChar;
        foreach (var entry in archive.Entries)
        {
            var destination = Path.GetFullPath(Path.Combine(output, entry.FullName));
            if (!destination.StartsWith(outputRoot, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException($"Package entry escapes extraction folder: {entry.FullName}");

            if (string.IsNullOrEmpty(entry.Name))
            {
                Directory.CreateDirectory(destination);
                continue;
            }

            Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
            entry.ExtractToFile(destination, true);
        }

        return output;
    }

    private static string? FindAssetRootIfExists(string directory)
    {
        if (!Directory.Exists(directory))
            return null;

        try
        {
            return FindAssetRoot(directory);
        }
        catch
        {
            return null;
        }
    }

    private static string AppendQuery(string url, string query)
    {
        if (string.IsNullOrWhiteSpace(query))
            return url;

        query = query.TrimStart('?', '&');
        return $"{url}{(url.Contains('?') ? '&' : '?')}{query}";
    }

    private static string ToFileUri(string path) => new Uri(Path.GetFullPath(path)).AbsoluteUri;

    private static bool IsHttpUrl(string value) =>
        Uri.TryCreate(value, UriKind.Absolute, out var uri) &&
        (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);

    private static string ExpandPath(string path) =>
        Environment.ExpandEnvironmentVariables(path.Trim().Trim('"'));

    private static string SanitizeFileName(string name)
    {
        foreach (var c in Path.GetInvalidFileNameChars())
            name = name.Replace(c, '-');
        return name;
    }

    private static JsonSerializerOptions JsonOptions() => new()
    {
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true
    };
}

internal sealed class LivelyInfo
{
    public string? AppVersion { get; set; }
    public string? Title { get; set; }
    public string? Thumbnail { get; set; }
    public string? Preview { get; set; }
    public string? Desc { get; set; }
    public string? Author { get; set; }
    public string? License { get; set; }
    public string? Contact { get; set; }
    public JsonElement Type { get; set; }
    public string? FileName { get; set; }
    public string? Arguments { get; set; }
    public bool IsAbsolutePath { get; set; }

    public WallpaperKind GetKind()
    {
        if (Type.ValueKind == JsonValueKind.Number && Type.TryGetInt32(out var number))
            return Enum.IsDefined(typeof(WallpaperKind), number) ? (WallpaperKind)number : WallpaperKind.Unknown;

        if (Type.ValueKind == JsonValueKind.String)
        {
            var value = Type.GetString();
            if (int.TryParse(value, out number) && Enum.IsDefined(typeof(WallpaperKind), number))
                return (WallpaperKind)number;
            if (Enum.TryParse<WallpaperKind>(value, true, out var parsed))
                return parsed;
        }

        return FileName is null ? WallpaperKind.Unknown : LivelyAssetKindFromExtension(FileName);
    }

    private static WallpaperKind LivelyAssetKindFromExtension(string fileName)
    {
        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        if (ext is ".html" or ".htm")
            return WallpaperKind.Web;
        if (ext is ".jpg" or ".jpeg" or ".png" or ".bmp" or ".webp")
            return WallpaperKind.Picture;
        if (ext == ".gif")
            return WallpaperKind.Gif;
        if (ext is ".mp4" or ".mov" or ".webm" or ".mkv" or ".avi" or ".wmv")
            return WallpaperKind.Video;
        return WallpaperKind.Unknown;
    }
}
