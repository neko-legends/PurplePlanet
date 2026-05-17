namespace PurplePlanet;

internal sealed class ScreenSaverAppContext : ApplicationContext
{
    private const int InputGraceMs = 900;
    private const int MouseMoveThreshold = 8;

    private readonly WallpaperHost host = new();
    private readonly System.Windows.Forms.Timer inputTimer = new();
    private readonly Form keepAliveForm = new();
    private readonly bool monitorInput;
    private readonly DateTime startedAt = DateTime.UtcNow;
    private NativeMethods.POINT startCursor;
    private bool cursorHidden;

    public ScreenSaverAppContext(AppConfig config, WallpaperHostOptions options)
    {
        keepAliveForm.ShowInTaskbar = false;
        keepAliveForm.FormBorderStyle = FormBorderStyle.None;
        keepAliveForm.StartPosition = FormStartPosition.Manual;
        keepAliveForm.Location = new Point(-32000, -32000);
        keepAliveForm.Opacity = 0;
        keepAliveForm.Size = new Size(1, 1);
        MainForm = keepAliveForm;

        monitorInput = options.Mode == WallpaperHostMode.Screensaver;

        if (monitorInput)
        {
            _ = NativeMethods.GetCursorPos(out startCursor);
            Cursor.Hide();
            cursorHidden = true;
        }

        host.Start(config, options);
        keepAliveForm.Show();

        if (monitorInput)
        {
            inputTimer.Interval = 90;
            inputTimer.Tick += InputTimerTick;
            inputTimer.Start();
        }
    }

    private void InputTimerTick(object? sender, EventArgs e)
    {
        if ((DateTime.UtcNow - startedAt).TotalMilliseconds < InputGraceMs)
            return;

        if (HasMouseMoved() || IsAnyKeyDown())
            ExitThread();
    }

    private bool HasMouseMoved()
    {
        if (!NativeMethods.GetCursorPos(out var current))
            return false;

        return Math.Abs(current.X - startCursor.X) > MouseMoveThreshold ||
            Math.Abs(current.Y - startCursor.Y) > MouseMoveThreshold;
    }

    private static bool IsAnyKeyDown()
    {
        for (var key = 1; key <= 254; key++)
        {
            if ((NativeMethods.GetAsyncKeyState(key) & 0x8000) != 0)
                return true;
        }

        return false;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            inputTimer.Stop();
            inputTimer.Dispose();
            host.Dispose();
            keepAliveForm.Dispose();

            if (cursorHidden)
                Cursor.Show();
        }

        base.Dispose(disposing);
    }
}
