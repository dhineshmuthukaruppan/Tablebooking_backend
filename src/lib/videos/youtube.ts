export function extractYouTubeId(input: string): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;

  // Already an ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;

  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();

    // youtu.be/<id>
    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }

    // youtube.com/watch?v=<id>
    if (host.endsWith("youtube.com")) {
      const v = url.searchParams.get("v");
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;

      // youtube.com/embed/<id> or /shorts/<id>
      const parts = url.pathname.split("/").filter(Boolean);
      const embedIndex = parts.findIndex((p) => p === "embed" || p === "shorts");
      if (embedIndex >= 0) {
        const id = parts[embedIndex + 1];
        return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
      }
    }
  } catch {
    // Not a valid URL; fall through
  }

  // Fallback: try to find a v= param in plain text
  const vMatch = raw.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (vMatch?.[1]) return vMatch[1];

  // Fallback: embed/<id> or shorts/<id>
  const pathMatch = raw.match(/(?:embed|shorts)\/([a-zA-Z0-9_-]{11})/);
  if (pathMatch?.[1]) return pathMatch[1];

  return null;
}

export function youtubeThumbnailUrl(youtubeId: string): string {
  const id = youtubeId.trim();
  return `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
}

export function youtubeEmbedUrl(youtubeId: string): string {
  const id = youtubeId.trim();
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;
}

