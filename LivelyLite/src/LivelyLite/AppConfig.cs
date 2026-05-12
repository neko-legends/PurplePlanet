using System.Text.Json;

namespace LivelyLite;

internal sealed class AppConfig
{
    public string WallpaperPath { get; set; } = "";
    public string Layout { get; set; } = "span";
    public string QueryString { get; set; } = "";
    public string? BrowserExecutable { get; set; }
    public bool AttachToDesktop { get; set; } = true;
    public bool RestartOnDisplayChange { get; set; } = true;
    public int StartupTimeoutMs { get; set; } = 10000;

    public static string ResolveConfigPath(string[] args)
    {
        var explicitPath = GetArg(args, "--config");
        if (!string.IsNullOrWhiteSpace(explicitPath))
            return Path.GetFullPath(explicitPath);

        var local = Path.Combine(Directory.GetCurrentDirectory(), "config.json");
        if (File.Exists(local))
            return local;

        var appData = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "LivelyLite");
        Directory.CreateDirectory(appData);
        return Path.Combine(appData, "config.json");
    }

    public static AppConfig LoadOrCreate(string path, string[] args)
    {
        AppConfig config;
        if (File.Exists(path))
        {
            var json = File.ReadAllText(path);
            config = JsonSerializer.Deserialize<AppConfig>(json, JsonOptions()) ?? CreateDefault();
        }
        else
        {
            config = CreateDefault();
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.WriteAllText(path, JsonSerializer.Serialize(config, JsonOptions()));
        }

        ApplyOverrides(config, args);
        return config;
    }

    public string NormalizedLayout =>
        Layout.Equals("per-monitor", StringComparison.OrdinalIgnoreCase) ||
        Layout.Equals("permonitor", StringComparison.OrdinalIgnoreCase)
            ? "per-monitor"
            : "span";

    private static AppConfig CreateDefault()
    {
        return new AppConfig
        {
            WallpaperPath = FindDefaultWallpaper(),
            Layout = "span",
            QueryString = "quality=balanced&fps=30&pixelRatio=1",
            AttachToDesktop = true,
            RestartOnDisplayChange = true,
            StartupTimeoutMs = 10000
        };
    }

    private static string FindDefaultWallpaper()
    {
        var searchRoots = new[]
        {
            Directory.GetCurrentDirectory(),
            AppContext.BaseDirectory
        };

        foreach (var root in searchRoots)
        {
            foreach (var directory in SelfAndParents(root))
            {
                var live = Path.Combine(directory.FullName, "live-wallpaper");
                if (Directory.Exists(live))
                    return live;

                var package = Path.Combine(directory.FullName, "packages", "PurplePlanet.lively");
                if (File.Exists(package))
                    return package;
            }
        }

        var fixedLive = @"D:\forPublic\PurplePlanet\live-wallpaper";
        var fixedPackage = @"D:\forPublic\PurplePlanet\packages\PurplePlanet.lively";
        return Directory.Exists(fixedLive) ? fixedLive : File.Exists(fixedPackage) ? fixedPackage : "";
    }

    private static IEnumerable<DirectoryInfo> SelfAndParents(string path)
    {
        var directory = new DirectoryInfo(Path.GetFullPath(path));
        while (directory is not null)
        {
            yield return directory;
            directory = directory.Parent;
        }
    }

    private static void ApplyOverrides(AppConfig config, string[] args)
    {
        SetIfPresent(args, "--wallpaper", value => config.WallpaperPath = value);
        SetIfPresent(args, "--layout", value => config.Layout = value);
        SetIfPresent(args, "--query", value => config.QueryString = value);
        SetIfPresent(args, "--browser", value => config.BrowserExecutable = value);

        if (args.Any(x => x.Equals("--no-desktop", StringComparison.OrdinalIgnoreCase)))
            config.AttachToDesktop = false;
    }

    private static void SetIfPresent(string[] args, string name, Action<string> set)
    {
        var value = GetArg(args, name);
        if (!string.IsNullOrWhiteSpace(value))
            set(value);
    }

    private static string? GetArg(string[] args, string name)
    {
        for (var i = 0; i < args.Length; i++)
        {
            if (!args[i].Equals(name, StringComparison.OrdinalIgnoreCase))
                continue;

            return i + 1 < args.Length ? args[i + 1] : null;
        }

        return null;
    }

    private static JsonSerializerOptions JsonOptions() => new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true
    };
}
