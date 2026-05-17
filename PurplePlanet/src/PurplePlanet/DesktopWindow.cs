namespace PurplePlanet;

internal static class DesktopWindow
{
    public static IntPtr GetWallpaperHost()
    {
        var progman = NativeMethods.FindWindow("Progman", null);
        if (progman == IntPtr.Zero)
            throw new InvalidOperationException("Could not find Progman desktop window.");

        NativeMethods.SendMessageTimeout(
            progman,
            0x052C,
            IntPtr.Zero,
            IntPtr.Zero,
            NativeMethods.SendMessageTimeoutFlags.SMTO_NORMAL,
            1000,
            out _);

        NativeMethods.SendMessageTimeout(
            progman,
            0x052C,
            new IntPtr(0xD),
            new IntPtr(0x1),
            NativeMethods.SendMessageTimeoutFlags.SMTO_NORMAL,
            1000,
            out _);

        var wallpaperHost = IntPtr.Zero;
        NativeMethods.EnumWindows((topHandle, _) =>
        {
            var shellView = NativeMethods.FindWindowEx(topHandle, IntPtr.Zero, "SHELLDLL_DefView", null);
            if (shellView != IntPtr.Zero)
            {
                wallpaperHost = NativeMethods.FindWindowEx(IntPtr.Zero, topHandle, "WorkerW", null);
                return false;
            }

            return true;
        }, IntPtr.Zero);

        if (wallpaperHost != IntPtr.Zero)
            return wallpaperHost;

        NativeMethods.EnumWindows((topHandle, _) =>
        {
            if (!NativeMethods.GetWindowClass(topHandle).Equals("WorkerW", StringComparison.OrdinalIgnoreCase))
                return true;

            var shellView = NativeMethods.FindWindowEx(topHandle, IntPtr.Zero, "SHELLDLL_DefView", null);
            if (shellView != IntPtr.Zero)
                return true;

            wallpaperHost = topHandle;
            return false;
        }, IntPtr.Zero);

        return wallpaperHost == IntPtr.Zero ? progman : wallpaperHost;
    }
}
