using System.Diagnostics;
using System.Drawing;

namespace LivelyLite;

internal sealed class WallpaperHost : IDisposable
{
    private readonly List<WallpaperProcess> processes = new();
    private readonly BrowserJob browserJob = new();
    private StaticFileServer? staticFileServer;
    private string? profileRoot;
    private AppConfig? config;
    private LivelyAsset? asset;

    public LivelyAsset? CurrentAsset => asset;

    public void Start(AppConfig newConfig)
    {
        Stop();

        config = newConfig;
        asset = LivelyAsset.Load(newConfig.WallpaperPath);
        if (!asset.IsSupported)
            throw new NotSupportedException($"'{asset.Kind}' wallpapers are intentionally not included in LivelyLite.");

        if (asset.RequiresHttpServer)
            staticFileServer = new StaticFileServer(asset.RootDirectory);

        var browser = BrowserLocator.Find(newConfig.BrowserExecutable);
        profileRoot = Path.Combine(AppPaths.BrowserProfiles, Guid.NewGuid().ToString("N"));
        var targets = GetTargets(newConfig);

        foreach (var target in targets)
        {
            var process = LaunchBrowser(browser, asset, newConfig, target, staticFileServer, profileRoot, browserJob);
            processes.Add(process);
        }
    }

    public void Reattach()
    {
        if (config is null || asset is null || !config.AttachToDesktop)
            return;

        foreach (var process in processes.ToArray())
        {
            if (process.WindowHandle == IntPtr.Zero || !NativeMethods.IsWindow(process.WindowHandle))
                continue;

            AttachToDesktop(process.WindowHandle, process.Bounds);
        }
    }

    public void Stop()
    {
        foreach (var process in processes)
            process.Stop();

        processes.Clear();
        staticFileServer?.Dispose();
        staticFileServer = null;

        if (!string.IsNullOrWhiteSpace(profileRoot) && Directory.Exists(profileRoot))
        {
            try
            {
                Directory.Delete(profileRoot, true);
            }
            catch
            {
                // Browser profile cleanup is best-effort.
            }
        }

        profileRoot = null;
    }

    private static IReadOnlyList<TargetDisplay> GetTargets(AppConfig config)
    {
        if (config.NormalizedLayout == "per-monitor")
        {
            return Screen.AllScreens
                .Select((screen, index) => new TargetDisplay($"monitor-{index}", screen.Bounds))
                .ToArray();
        }

        return [new TargetDisplay("span", SystemInformation.VirtualScreen)];
    }

    private static WallpaperProcess LaunchBrowser(
        string browserPath,
        LivelyAsset asset,
        AppConfig config,
        TargetDisplay target,
        StaticFileServer? staticFileServer,
        string profileRoot,
        BrowserJob browserJob)
    {
        var startedAt = DateTime.Now.AddSeconds(-1);
        var profile = Path.Combine(profileRoot, target.Id);
        Directory.CreateDirectory(profile);

        var url = asset.GetLaunchUrl(config, staticFileServer);
        var psi = new ProcessStartInfo
        {
            FileName = browserPath,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        psi.ArgumentList.Add($"--user-data-dir={profile}");
        psi.ArgumentList.Add("--no-first-run");
        psi.ArgumentList.Add("--disable-session-crashed-bubble");
        psi.ArgumentList.Add("--disable-features=msEdgeStartupBoost,HardwareMediaKeyHandling");
        psi.ArgumentList.Add("--autoplay-policy=no-user-gesture-required");
        psi.ArgumentList.Add($"--window-position={target.Bounds.Left},{target.Bounds.Top}");
        psi.ArgumentList.Add($"--window-size={target.Bounds.Width},{target.Bounds.Height}");
        psi.ArgumentList.Add($"--app={url}");

        var process = Process.Start(psi) ?? throw new InvalidOperationException("Failed to start browser process.");
        browserJob.Assign(process);
        var hwnd = WaitForBrowserWindow(process, browserPath, asset.Title, startedAt, config.StartupTimeoutMs);
        if (hwnd == IntPtr.Zero)
            throw new TimeoutException("Timed out waiting for browser wallpaper window.");

        if (config.AttachToDesktop)
            AttachToDesktop(hwnd, target.Bounds);

        return new WallpaperProcess(process, hwnd, target.Bounds);
    }

    private static IntPtr WaitForBrowserWindow(Process launchedProcess, string browserPath, string title, DateTime startedAt, int timeoutMs)
    {
        var browserName = Path.GetFileNameWithoutExtension(browserPath);
        var deadline = DateTime.UtcNow.AddMilliseconds(Math.Max(1000, timeoutMs));

        while (DateTime.UtcNow < deadline)
        {
            try
            {
                launchedProcess.Refresh();
                if (launchedProcess.MainWindowHandle != IntPtr.Zero)
                    return launchedProcess.MainWindowHandle;
            }
            catch
            {
                // Chromium may hand off to a child process.
            }

            var direct = FindWindowByProcessId(launchedProcess.Id);
            if (direct != IntPtr.Zero)
                return direct;

            var candidate = FindRecentBrowserWindow(browserName, title, startedAt);
            if (candidate != IntPtr.Zero)
                return candidate;

            Thread.Sleep(100);
        }

        return IntPtr.Zero;
    }

    private static IntPtr FindWindowByProcessId(int pid)
    {
        foreach (var hwnd in NativeMethods.TopLevelWindows())
        {
            if (!NativeMethods.IsWindowVisible(hwnd))
                continue;

            if (NativeMethods.GetProcessId(hwnd) == pid)
                return hwnd;
        }

        return IntPtr.Zero;
    }

    private static IntPtr FindRecentBrowserWindow(string browserName, string title, DateTime startedAt)
    {
        foreach (var hwnd in NativeMethods.TopLevelWindows())
        {
            if (!NativeMethods.IsWindowVisible(hwnd))
                continue;

            var className = NativeMethods.GetWindowClass(hwnd);
            if (!className.StartsWith("Chrome_WidgetWin", StringComparison.OrdinalIgnoreCase))
                continue;

            var pid = NativeMethods.GetProcessId(hwnd);
            if (pid is null)
                continue;

            using var process = NativeMethods.TryGetProcess(pid.Value);
            if (process is null)
                continue;

            try
            {
                if (!process.ProcessName.Equals(browserName, StringComparison.OrdinalIgnoreCase))
                    continue;

                var windowTitle = NativeMethods.GetWindowTitle(hwnd);
                if (windowTitle.Contains(title, StringComparison.OrdinalIgnoreCase))
                    return hwnd;

                if (process.StartTime >= startedAt)
                    return hwnd;
            }
            catch
            {
                // Ignore protected/racing processes.
            }
        }

        return IntPtr.Zero;
    }

    private static void AttachToDesktop(IntPtr hwnd, Rectangle bounds)
    {
        var parent = DesktopWindow.GetWallpaperHost();

        var style = NativeMethods.GetWindowLongPtr(hwnd, NativeMethods.GWL_STYLE).ToInt64();
        style &= ~(NativeMethods.WS_POPUP |
                   NativeMethods.WS_CAPTION |
                   NativeMethods.WS_THICKFRAME |
                   NativeMethods.WS_SYSMENU |
                   NativeMethods.WS_MINIMIZEBOX |
                   NativeMethods.WS_MAXIMIZEBOX);
        style |= NativeMethods.WS_CHILD | NativeMethods.WS_VISIBLE;
        _ = NativeMethods.SetWindowLongPtr(hwnd, NativeMethods.GWL_STYLE, new IntPtr(style));

        var exStyle = NativeMethods.GetWindowLongPtr(hwnd, NativeMethods.GWL_EXSTYLE).ToInt64();
        exStyle &= ~NativeMethods.WS_EX_APPWINDOW;
        exStyle |= NativeMethods.WS_EX_TOOLWINDOW;
        _ = NativeMethods.SetWindowLongPtr(hwnd, NativeMethods.GWL_EXSTYLE, new IntPtr(exStyle));

        _ = NativeMethods.SetParent(hwnd, parent);
        _ = NativeMethods.SetWindowPos(
            hwnd,
            NativeMethods.HWND_BOTTOM,
            bounds.Left,
            bounds.Top,
            bounds.Width,
            bounds.Height,
            NativeMethods.SWP_FRAMECHANGED | NativeMethods.SWP_SHOWWINDOW | NativeMethods.SWP_NOACTIVATE);
    }

    public void Dispose()
    {
        Stop();
        browserJob.Dispose();
    }

    private sealed record TargetDisplay(string Id, Rectangle Bounds);

    private sealed class WallpaperProcess(Process process, IntPtr windowHandle, Rectangle bounds)
    {
        public IntPtr WindowHandle { get; } = windowHandle;
        public Rectangle Bounds { get; } = bounds;

        public void Stop()
        {
            try
            {
                if (!process.HasExited)
                {
                    process.CloseMainWindow();
                    if (!process.WaitForExit(1500))
                        process.Kill(entireProcessTree: true);
                }
            }
            catch
            {
                // Best-effort cleanup.
            }
            finally
            {
                process.Dispose();
            }
        }
    }
}
