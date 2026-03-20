import { extractYouTubeId, youtubeThumbnailUrl } from "./youtube";

type YoutubeOEmbedResponse = {
  title?: string;
  thumbnail_url?: string;
  author_name?: string;
};

function isYouTubeHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === "youtu.be" ||
    h === "youtube.com" ||
    h === "www.youtube.com" ||
    h === "m.youtube.com" ||
    h === "youtube-nocookie.com" ||
    h === "www.youtube-nocookie.com" ||
    h.endsWith(".youtube.com")
  );
}

export async function fetchYouTubePreview(url: string): Promise<{
  youtubeId: string;
  title: string;
  thumbnailUrl: string;
}> {
  const raw = (url ?? "").trim();
  const youtubeId = extractYouTubeId(raw);
  if (!youtubeId) {
    throw new Error("Invalid YouTube URL");
  }

  // Basic SSRF guard: only allow YouTube hosts
  try {
    const parsed = new URL(raw);
    if (!isYouTubeHost(parsed.hostname)) {
      throw new Error("Unsupported video host");
    }
  } catch {
    // If it's not a valid absolute URL, still fail (we need oEmbed to work reliably)
    throw new Error("Invalid YouTube URL");
  }

  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(raw)}&format=json`;
  const resp = await fetch(endpoint);
  if (!resp.ok) {
    throw new Error("Failed to fetch preview");
  }
  const json = (await resp.json()) as YoutubeOEmbedResponse;
  const title = (json?.title ?? "").trim();
  const thumbnailFromOEmbed = (json?.thumbnail_url ?? "").trim();

  if (!title || !thumbnailFromOEmbed) {
    // Do not allow saving if we cannot reliably provide preview title + thumbnail.
    throw new Error("Missing preview data");
  }

  return {
    youtubeId,
    title,
    thumbnailUrl: thumbnailFromOEmbed || youtubeThumbnailUrl(youtubeId),
  };
}

