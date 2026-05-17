namespace PurplePlanet;

internal static class AppPaths
{
    public static string AppData { get; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "PurplePlanet");

    public static string PackageCache { get; } = Ensure(Path.Combine(AppData, "Packages"));
    public static string BrowserProfiles { get; } = Ensure(Path.Combine(AppData, "BrowserProfiles"));
    public static string Generated { get; } = Ensure(Path.Combine(AppData, "Generated"));

    private static string Ensure(string path)
    {
        Directory.CreateDirectory(path);
        return path;
    }
}
