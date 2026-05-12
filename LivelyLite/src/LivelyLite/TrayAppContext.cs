using Microsoft.Win32;
using System.Diagnostics;

namespace LivelyLite;

internal sealed class TrayAppContext : ApplicationContext
{
    private readonly string configPath;
    private AppConfig config;
    private readonly WallpaperHost host = new();
    private readonly NotifyIcon notifyIcon;
    private readonly MessageForm messageForm;

    public TrayAppContext(string configPath, AppConfig config)
    {
        this.configPath = configPath;
        this.config = config;

        notifyIcon = new NotifyIcon
        {
            Icon = SystemIcons.Application,
            Visible = true,
            Text = "LivelyLite",
            ContextMenuStrip = BuildMenu()
        };

        messageForm = new MessageForm(() =>
        {
            if (this.config.RestartOnDisplayChange)
                Reload();
            else
                host.Reattach();
        });
        messageForm.Show();
        messageForm.Hide();

        SystemEvents.DisplaySettingsChanged += DisplaySettingsChanged;
        StartHost();
    }

    private ContextMenuStrip BuildMenu()
    {
        var menu = new ContextMenuStrip();
        menu.Items.Add("Reload", null, (_, _) => Reload());
        menu.Items.Add("Open config", null, (_, _) => OpenPath(configPath));
        menu.Items.Add("Open wallpaper folder", null, (_, _) => OpenWallpaperLocation());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Quit", null, (_, _) => ExitThread());
        return menu;
    }

    private void StartHost()
    {
        try
        {
            host.Start(config);
            var title = host.CurrentAsset?.Title ?? "LivelyLite";
            notifyIcon.Text = title.Length > 63 ? title[..63] : title;
            notifyIcon.ShowBalloonTip(1500, "LivelyLite", $"Loaded {title}", ToolTipIcon.Info);
        }
        catch (Exception ex)
        {
            notifyIcon.ShowBalloonTip(4000, "LivelyLite error", ex.Message, ToolTipIcon.Error);
            MessageBox.Show(ex.ToString(), "LivelyLite", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void Reload()
    {
        config = AppConfig.LoadOrCreate(configPath, []);
        StartHost();
    }

    private void OpenWallpaperLocation()
    {
        var path = Environment.ExpandEnvironmentVariables(config.WallpaperPath.Trim('"'));
        if (File.Exists(path))
            path = Path.GetDirectoryName(path)!;

        if (Directory.Exists(path))
            OpenPath(path);
    }

    private static void OpenPath(string path)
    {
        try
        {
            Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "LivelyLite", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void DisplaySettingsChanged(object? sender, EventArgs e)
    {
        if (config.RestartOnDisplayChange)
            Reload();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            SystemEvents.DisplaySettingsChanged -= DisplaySettingsChanged;
            messageForm.Dispose();
            notifyIcon.Visible = false;
            notifyIcon.Dispose();
            host.Dispose();
        }

        base.Dispose(disposing);
    }
}

internal sealed class MessageForm : Form
{
    private readonly Action taskbarCreated;
    private readonly uint taskbarCreatedMessage;

    public MessageForm(Action taskbarCreated)
    {
        this.taskbarCreated = taskbarCreated;
        taskbarCreatedMessage = NativeMethods.RegisterWindowMessage("TaskbarCreated");

        ShowInTaskbar = false;
        FormBorderStyle = FormBorderStyle.None;
        WindowState = FormWindowState.Minimized;
        Opacity = 0;
        Size = Size.Empty;
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == taskbarCreatedMessage)
            taskbarCreated();

        base.WndProc(ref m);
    }
}
