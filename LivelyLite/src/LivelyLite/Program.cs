namespace LivelyLite;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        using var mutex = new Mutex(true, "LivelyLite:DesktopWallpaperHost", out var created);
        if (!created)
        {
            MessageBox.Show("LivelyLite is already running.", "LivelyLite", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        ApplicationConfiguration.Initialize();

        var configPath = AppConfig.ResolveConfigPath(args);
        var config = AppConfig.LoadOrCreate(configPath, args);
        Application.Run(new TrayAppContext(configPath, config));
    }
}
