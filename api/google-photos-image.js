export const runtime = 'nodejs';
export const maxDuration = 30;

const ALLOWED_HOSTS = new Set([
  'lh3.googleusercontent.com',
  'lh4.googleusercontent.com',
  'lh5.googleusercontent.com',
  'lh6.googleusercontent.com',
]);

function errorResponse(res, status, message) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ error: message }));
}

function parseImageUrl(value) {
  if (!value || typeof value !== 'string') {
    throw new Error('Missing image URL.');
  }

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Invalid image URL.');
  }

  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error('Only Google Photos image CDN URLs are supported.');
  }

  return url.toString();
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return errorResponse(res, 405, 'Method not allowed.');
  }

  try {
    const imageUrl = parseImageUrl(
      Array.isArray(req.query?.url) ? req.query.url[0] : req.query?.url
    );

    const upstream = await fetch(imageUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'img29/1.0 Google Photos shared-link importer',
        'Accept': 'image/avif,image/webp,image/jpeg,image/png,*/*;q=0.8',
      },
    });

    if (!upstream.ok || !upstream.body) {
      return errorResponse(
        res,
        upstream.status || 502,
        `Google image server returned ${upstream.status || 502}.`
      );
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    const contentLength = upstream.headers.get('content-length');

    if (!contentType.toLowerCase().startsWith('image/')) {
      return errorResponse(res, 502, 'Google Photos did not return an image.');
    }

    res.status(200);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    // Node 22 exposes the Web ReadableStream returned by fetch.
    const { Readable } = await import('node:stream');
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (error) {
    console.error('Google Photos image proxy error:', error);
    return errorResponse(
      res,
      400,
      error?.message || 'Could not download the Google Photos image.'
    );
  }
}
