// apps/mobile/lib/youtube.ts
//
// Turns a YouTube link into a privacy-friendly embed URL, or null when the
// link is not a recognisable YouTube video.
const ID = /^[A-Za-z0-9_-]{6,20}$/;

export function youtubeVideoId(url: string | null): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www\.|m\.)/, '');
  let id: string | null = null;
  if (host === 'youtu.be') {
    id = u.pathname.split('/')[1] ?? null;
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[0] === 'watch') id = u.searchParams.get('v');
    else if (parts[0] === 'shorts' || parts[0] === 'embed') id = parts[1] ?? null;
  }
  return id && ID.test(id) ? id : null;
}

/** The origin the WebView page claims. YouTube rejects embeds with no origin/referrer (Error 153). */
export const YOUTUBE_EMBED_ORIGIN = 'https://www.youtube.com';

export function youtubeEmbedUrl(url: string | null): string | null {
  const id = youtubeVideoId(url);
  return id
    ? `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0&origin=${encodeURIComponent(YOUTUBE_EMBED_ORIGIN)}`
    : null;
}

/** An HTML page wrapping the embed in an iframe, loaded with baseUrl = YOUTUBE_EMBED_ORIGIN so the player gets a real referrer. */
export function youtubeEmbedHtml(embedUrl: string): string {
  const src = embedUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#000}iframe{border:0;width:100%;height:100%}</style></head><body><iframe src="${src}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></body></html>`;
}
