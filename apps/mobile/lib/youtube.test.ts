import { YOUTUBE_EMBED_ORIGIN, youtubeEmbedHtml, youtubeEmbedUrl } from './youtube';

const OUT = 'https://www.youtube-nocookie.com/embed/ultWZbUMPL8?playsinline=1&rel=0&origin=https%3A%2F%2Fwww.youtube.com';

test('accepts watch, youtu.be, shorts and embed forms', () => {
  expect(youtubeEmbedUrl('https://www.youtube.com/watch?v=ultWZbUMPL8')).toBe(OUT);
  expect(youtubeEmbedUrl('https://www.youtube.com/watch?v=ultWZbUMPL8&t=10s')).toBe(OUT);
  expect(youtubeEmbedUrl('https://youtu.be/ultWZbUMPL8')).toBe(OUT);
  expect(youtubeEmbedUrl('https://www.youtube.com/shorts/ultWZbUMPL8')).toBe(OUT);
  expect(youtubeEmbedUrl('https://www.youtube.com/embed/ultWZbUMPL8')).toBe(OUT);
  expect(youtubeEmbedUrl('https://m.youtube.com/watch?v=ultWZbUMPL8')).toBe(OUT);
});

test('returns null for anything else', () => {
  expect(youtubeEmbedUrl('https://example.com')).toBeNull();
  expect(youtubeEmbedUrl('https://example.com/watch?v=ultWZbUMPL8')).toBeNull();
  expect(youtubeEmbedUrl('https://www.youtube.com/watch')).toBeNull();
  expect(youtubeEmbedUrl('not a url')).toBeNull();
  expect(youtubeEmbedUrl(null)).toBeNull();
});

test('embed html wraps the url in an iframe with escaped ampersands', () => {
  const html = youtubeEmbedHtml(OUT);
  expect(html).toContain('<iframe src="https://www.youtube-nocookie.com/embed/ultWZbUMPL8?playsinline=1&amp;rel=0&amp;origin=');
  expect(html).toContain('allowfullscreen');
  expect(YOUTUBE_EMBED_ORIGIN).toBe('https://www.youtube.com');
});
