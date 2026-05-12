namespace LivelyLite;

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
            new IntPtr(0xD),
            new IntPtr(0x1),
            NativeMethods.SendMessageTimeoutFlags.SMTO_NORMAL,
            1000,
            out _);

        var workerW = IntPtr.Zero;
        NativeMethods.EnumWindows((topHandle, _) =>
        {
            var shellView = NativeMethods.FindWindowEx(topHandle, IntPtr.Zero, "SHELLDLL_DefView", null);
            if (shellView != IntPtr.Zero)
                workerW = NativeMethods.FindWindowEx(IntPtr.Zero, topHandle, "WorkerW", null);

            return true;
        }, IntPtr.Zero);

        if (workerW == IntPtr.Zero)
            workerW = NativeMethods.FindWindowEx(progman, IntPtr.Zero, "WorkerW", null);

        return workerW == IntPtr.Zero ? progman : workerW;
    }
}
