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

export function youtubeEmbedUrl(url: string | null): string | null {
  const id = youtubeVideoId(url);
  return id ? `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0` : null;
}
