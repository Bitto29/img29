import * as GooglePhotosAlbum from 'google-photos-album-image-url-fetch';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ALLOWED_HOSTS = new Set([
  'photos.app.goo.gl',
  'photos.google.com',
]);

function json(res, status, data) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

function parseSharedUrl(value) {
  if (!value || typeof value !== 'string') {
    throw new Error('Missing Google Photos shared-album URL.');
  }

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Invalid Google Photos URL.');
  }

  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error(
      'Only public https://photos.app.goo.gl/... or https://photos.google.com/... links are supported.'
    );
  }

  return url.toString();
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method not allowed.' });
  }

  try {
    const rawUrl = Array.isArray(req.query?.url) ? req.query.url[0] : req.query?.url;
    const albumUrl = parseSharedUrl(rawUrl);

    const result = await GooglePhotosAlbum.fetchImageUrls(albumUrl);

    if (!result) {
      return json(res, 422, {
        error:
          'Google Photos returned a page that could not be parsed. Make sure link sharing is enabled and the link is a public shared album.',
      });
    }

    const items = result
      .filter(item => item && item.url && !item.isVideo)
      .map((item, index) => {
        const width = Number(item.width) || 2400;
        const height = Number(item.height) || 2400;

        // Ask Google CDN for a reasonably high-resolution version. img29
        // later scales anything longer than MAX_DIM down to 2400 px.
        const imageUrl = `${item.url}=w2400-h2400`;

        return {
          id: item.uid || `photo-${index + 1}`,
          url: imageUrl,
          width,
          height,
          isVideo: false,
          imageUpdateDate: item.imageUpdateDate || null,
          albumAddDate: item.albumAddDate || null,
        };
      });

    return json(res, 200, {
      ok: true,
      count: items.length,
      items,
    });
  } catch (error) {
    console.error('Google Photos shared-link import error:', error);

    const status =
      error?.name === 'InvalidAlbumUrlError' ? 400 :
      error?.name === 'AlbumFetchError' ? 502 :
      error?.name === 'AlbumParseError' ? 422 :
      error?.name === 'AlbumPaginationError' ? 502 :
      400;

    return json(res, status, {
      error: error?.message || 'Could not read the Google Photos shared album.',
    });
  }
}
