namespace PurplePlanet;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();

        var screenSaverCommand = ScreenSaverCommand.Parse(args);
        var configPath = AppConfig.ResolveConfigPath(args);
        var config = AppConfig.LoadOrCreate(configPath, args);

        if (screenSaverCommand.Kind == ScreenSaverCommandKind.Configure)
        {
            ShowConfiguration(configPath);
            return;
        }

        if (screenSaverCommand.Kind == ScreenSaverCommandKind.Preview)
        {
            if (screenSaverCommand.PreviewParent == IntPtr.Zero)
                return;

            Application.Run(new ScreenSaverAppContext(config, WallpaperHostOptions.Preview(screenSaverCommand.PreviewParent)));
            return;
        }

        if (screenSaverCommand.Kind == ScreenSaverCommandKind.Start)
        {
            using var screenSaverMutex = new Mutex(true, "PurplePlanet:ScreenSaverHost", out var screenSaverCreated);
            if (!screenSaverCreated)
                return;

            Application.Run(new ScreenSaverAppContext(config, WallpaperHostOptions.Screensaver));
            return;
        }

        using var mutex = new Mutex(true, "PurplePlanet:DesktopWallpaperHost", out var created);
        if (!created)
        {
            MessageBox.Show("PurplePlanet is already running.", "PurplePlanet", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        Application.Run(new TrayAppContext(configPath, config));
    }

    private static void ShowConfiguration(string configPath)
    {
        try
        {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(configPath)
            {
                UseShellExecute = true
            });
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "PurplePlanet screensaver", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        MessageBox.Show(
            "Edit config.json to change the wallpaper, quality, monitor layout, or browser path.\n\n" +
            "Use Install-Screensaver.ps1 to register PurplePlanet as the current Windows screensaver.",
            "PurplePlanet screensaver",
            MessageBoxButtons.OK,
            MessageBoxIcon.Information);
    }
}
