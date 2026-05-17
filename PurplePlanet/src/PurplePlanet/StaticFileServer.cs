using System.Net;
using System.Net.Sockets;
using System.Text;

namespace PurplePlanet;

internal sealed class StaticFileServer : IDisposable
{
    private readonly string root;
    private readonly TcpListener listener;
    private readonly CancellationTokenSource cancellation = new();
    private readonly Task acceptLoop;

    public StaticFileServer(string rootDirectory)
    {
        root = Path.GetFullPath(rootDirectory);
        listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        Port = ((IPEndPoint)listener.LocalEndpoint).Port;
        acceptLoop = Task.Run(AcceptLoopAsync);
    }

    public int Port { get; }

    public string GetUrl(string filePath)
    {
        var fullPath = Path.GetFullPath(filePath);
        if (!IsUnderRoot(fullPath))
            throw new InvalidOperationException($"Wallpaper file is outside the served root: {fullPath}");

        var relative = Path.GetRelativePath(root, fullPath)
            .Replace(Path.DirectorySeparatorChar, '/')
            .Replace(Path.AltDirectorySeparatorChar, '/');

        return $"http://127.0.0.1:{Port}/{Uri.EscapeDataString(relative).Replace("%2F", "/")}";
    }

    private async Task AcceptLoopAsync()
    {
        while (!cancellation.IsCancellationRequested)
        {
            try
            {
                var client = await listener.AcceptTcpClientAsync(cancellation.Token);
                _ = Task.Run(() => HandleClientAsync(client, cancellation.Token), cancellation.Token);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch
            {
                if (cancellation.IsCancellationRequested)
                    break;
            }
        }
    }

    private async Task HandleClientAsync(TcpClient client, CancellationToken token)
    {
        using var _ = client;
        using var stream = client.GetStream();

        var request = await ReadRequestAsync(stream, token);
        if (request is null)
            return;

        var parts = request.Split(' ', 3, StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length < 2 || parts[0] is not ("GET" or "HEAD"))
        {
            await WriteStatusAsync(stream, 405, "Method Not Allowed", token);
            return;
        }

        var path = parts[1].Split('?', 2)[0];
        path = Uri.UnescapeDataString(path).Replace('/', Path.DirectorySeparatorChar).TrimStart(Path.DirectorySeparatorChar);
        if (string.IsNullOrWhiteSpace(path))
            path = "index.html";

        var fullPath = Path.GetFullPath(Path.Combine(root, path));
        if (Directory.Exists(fullPath))
            fullPath = Path.Combine(fullPath, "index.html");

        if (!IsUnderRoot(fullPath) || !File.Exists(fullPath))
        {
            await WriteStatusAsync(stream, 404, "Not Found", token);
            return;
        }

        await WriteFileAsync(stream, fullPath, parts[0] == "HEAD", token);
    }

    private static async Task<string?> ReadRequestAsync(NetworkStream stream, CancellationToken token)
    {
        var buffer = new byte[8192];
        var length = await stream.ReadAsync(buffer, token);
        if (length <= 0)
            return null;

        var text = Encoding.ASCII.GetString(buffer, 0, length);
        var lineEnd = text.IndexOf("\r\n", StringComparison.Ordinal);
        return lineEnd < 0 ? text : text[..lineEnd];
    }

    private static async Task WriteFileAsync(NetworkStream stream, string fullPath, bool headersOnly, CancellationToken token)
    {
        var info = new FileInfo(fullPath);
        var headers =
            $"HTTP/1.1 200 OK\r\n" +
            $"Content-Type: {GetContentType(info.Extension)}\r\n" +
            $"Content-Length: {info.Length}\r\n" +
            "Cache-Control: no-store\r\n" +
            "Connection: close\r\n\r\n";

        await stream.WriteAsync(Encoding.ASCII.GetBytes(headers), token);
        if (headersOnly)
            return;

        await using var file = File.OpenRead(fullPath);
        await file.CopyToAsync(stream, token);
    }

    private static async Task WriteStatusAsync(NetworkStream stream, int status, string text, CancellationToken token)
    {
        var body = Encoding.UTF8.GetBytes(text);
        var headers =
            $"HTTP/1.1 {status} {text}\r\n" +
            "Content-Type: text/plain; charset=utf-8\r\n" +
            $"Content-Length: {body.Length}\r\n" +
            "Connection: close\r\n\r\n";

        await stream.WriteAsync(Encoding.ASCII.GetBytes(headers), token);
        await stream.WriteAsync(body, token);
    }

    private bool IsUnderRoot(string fullPath)
    {
        var normalizedRoot = root.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
        return fullPath.StartsWith(normalizedRoot, StringComparison.OrdinalIgnoreCase) ||
            fullPath.Equals(root, StringComparison.OrdinalIgnoreCase);
    }

    private static string GetContentType(string extension) =>
        extension.ToLowerInvariant() switch
        {
            ".html" or ".htm" => "text/html; charset=utf-8",
            ".js" or ".mjs" => "text/javascript; charset=utf-8",
            ".css" => "text/css; charset=utf-8",
            ".json" => "application/json; charset=utf-8",
            ".png" => "image/png",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".gif" => "image/gif",
            ".webp" => "image/webp",
            ".svg" => "image/svg+xml",
            ".ico" => "image/x-icon",
            ".mp4" => "video/mp4",
            ".webm" => "video/webm",
            _ => "application/octet-stream"
        };

    public void Dispose()
    {
        cancellation.Cancel();
        listener.Stop();

        try
        {
            acceptLoop.Wait(500);
        }
        catch
        {
            // Best-effort shutdown.
        }

        cancellation.Dispose();
    }
}
