// /api/relay.js
// A short-lived "mailbox" for the phone -> laptop transfer feature.
// POST   — phone drops one or more images in, keyed by a random session code
// GET    — laptop polls for that code until image(s) show up
// DELETE — laptop cleans them up once picked up
//
// Storage is Vercel Blob (Vercel's own product — needs to be enabled once
// in the project's Vercel dashboard under Storage). No third-party service
// is involved in the actual transfer; this is Vercel's own storage acting
// as a temporary pass-through between your two devices.

import { put, list, del } from '@vercel/blob';

export const runtime = 'nodejs';
export const maxDuration = 30;

function isValidCode(code) {
  return typeof code === 'string' && /^[0-9]{6}$/.test(code);
}

// Vercel Functions (Hobby plan) cap request bodies around 4.5MB total. Base64
// adds ~33% overhead, so keep each decoded image comfortably under that —
// send.html downscales/compresses photos client-side before they ever get
// here. MAX_IMAGES also guards the total request size when sending a batch.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_IMAGES = 10;

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      const { code, images } = req.body || {};
      if (!isValidCode(code) || !Array.isArray(images) || !images.length) {
        return res.status(400).json({ error: 'Invalid request' });
      }
      if (images.length > MAX_IMAGES) {
        return res.status(400).json({ error: `Too many images (max ${MAX_IMAGES})` });
      }

      const buffers = [];
      for (const dataUrl of images) {
        if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
          return res.status(400).json({ error: 'Invalid image data' });
        }
        const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
        const buffer = Buffer.from(base64, 'base64');
        if (buffer.length > MAX_IMAGE_BYTES) {
          return res.status(413).json({ error: 'One or more images too large' });
        }
        buffers.push(buffer);
      }

      // One atomic batch — the whole set lands before the laptop's poll
      // can see any of it, so it never picks up a partial group.
      await Promise.all(
        buffers.map((buffer, i) =>
          put(`sessions/${code}-${String(i).padStart(3, '0')}.jpg`, buffer, {
            access: 'public',
            addRandomSuffix: false,
            contentType: 'image/jpeg',
          })
        )
      );
      return res.status(200).json({ ok: true, count: buffers.length });
    }

    if (req.method === 'GET') {
      const code = req.query.code;
      if (!isValidCode(code)) return res.status(400).json({ error: 'Invalid code' });
      const { blobs } = await list({ prefix: `sessions/${code}-` });
      if (!blobs.length) return res.status(200).json({ ready: false });
      blobs.sort((a, b) => a.pathname.localeCompare(b.pathname));
      return res.status(200).json({ ready: true, urls: blobs.map(b => b.url) });
    }

    if (req.method === 'DELETE') {
      const { code } = req.body || {};
      if (!isValidCode(code)) return res.status(400).json({ error: 'Invalid code' });
      const { blobs } = await list({ prefix: `sessions/${code}-` });
      await Promise.all(blobs.map(b => del(b.url)));
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('relay error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
