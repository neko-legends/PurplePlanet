namespace PurplePlanet;

internal enum ScreenSaverCommandKind
{
    None,
    Start,
    Configure,
    Preview
}

internal sealed record ScreenSaverCommand(ScreenSaverCommandKind Kind, IntPtr PreviewParent)
{
    public static ScreenSaverCommand Parse(string[] args)
    {
        if (args.Length == 0)
        {
            return IsRunningAsScreenSaver()
                ? new ScreenSaverCommand(ScreenSaverCommandKind.Configure, IntPtr.Zero)
                : new ScreenSaverCommand(ScreenSaverCommandKind.None, IntPtr.Zero);
        }

        for (var i = 0; i < args.Length; i++)
        {
            var arg = args[i].Trim();
            if (arg.Length == 0)
                continue;

            var normalized = arg.Replace('-', '/');
            if (normalized.Equals("/s", StringComparison.OrdinalIgnoreCase))
                return new ScreenSaverCommand(ScreenSaverCommandKind.Start, IntPtr.Zero);

            if (normalized.Equals("/c", StringComparison.OrdinalIgnoreCase) ||
                normalized.StartsWith("/c:", StringComparison.OrdinalIgnoreCase))
                return new ScreenSaverCommand(ScreenSaverCommandKind.Configure, IntPtr.Zero);

            if (normalized.Equals("/p", StringComparison.OrdinalIgnoreCase))
            {
                var parent = i + 1 < args.Length ? ParseWindowHandle(args[i + 1]) : IntPtr.Zero;
                return new ScreenSaverCommand(ScreenSaverCommandKind.Preview, parent);
            }

            if (normalized.StartsWith("/p:", StringComparison.OrdinalIgnoreCase))
            {
                var parent = ParseWindowHandle(normalized[3..]);
                return new ScreenSaverCommand(ScreenSaverCommandKind.Preview, parent);
            }
        }

        return new ScreenSaverCommand(ScreenSaverCommandKind.None, IntPtr.Zero);
    }

    private static bool IsRunningAsScreenSaver() =>
        Path.GetExtension(Environment.ProcessPath ?? "").Equals(".scr", StringComparison.OrdinalIgnoreCase);

    private static IntPtr ParseWindowHandle(string value)
    {
        value = value.Trim();
        if (value.StartsWith("0x", StringComparison.OrdinalIgnoreCase))
            return nint.TryParse(value[2..], System.Globalization.NumberStyles.HexNumber, null, out var hex)
                ? new IntPtr(hex)
                : IntPtr.Zero;

        return nint.TryParse(value, out var numeric) ? new IntPtr(numeric) : IntPtr.Zero;
    }
}
