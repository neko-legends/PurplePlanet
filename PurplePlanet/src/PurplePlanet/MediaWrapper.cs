using System.Text;

namespace PurplePlanet;

internal static class MediaWrapper
{
    public static string GetUrl(string mediaPath, WallpaperKind kind)
    {
        var wrapper = Path.Combine(AppPaths.Generated, "media-wallpaper.html");
        if (!File.Exists(wrapper))
            File.WriteAllText(wrapper, Html, Encoding.UTF8);

        var mediaUri = new Uri(Path.GetFullPath(mediaPath)).AbsoluteUri;
        var mode = kind == WallpaperKind.Video ? "video" : "image";
        return $"{new Uri(wrapper).AbsoluteUri}?mode={mode}&src={Uri.EscapeDataString(mediaUri)}";
    }

    private const string Html = """
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>PurplePlanet Media Wallpaper</title>
    <style>
      html, body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: #000;
      }
      img, video {
        width: 100vw;
        height: 100vh;
        object-fit: cover;
        display: block;
        background: #000;
      }
    </style>
  </head>
  <body>
    <script>
      const params = new URLSearchParams(location.search);
      const src = params.get("src");
      const mode = params.get("mode");
      const el = document.createElement(mode === "video" ? "video" : "img");
      el.src = src;
      if (mode === "video") {
        el.autoplay = true;
        el.loop = true;
        el.muted = true;
        el.playsInline = true;
      }
      document.body.appendChild(el);
    </script>
  </body>
</html>
""";
}
