// /api/relay.js
// A short-lived "mailbox" for the phone -> laptop transfer feature.
// POST   — phone drops an image in, keyed by a random session code
// GET    — laptop polls for that code until the image shows up
// DELETE — laptop cleans it up once it's been picked up
//
// Storage is Vercel Blob (Vercel's own product — needs to be enabled once
// in the project's Vercel dashboard under Storage). No third-party service
// is involved in the actual transfer; this is Vercel's own storage acting
// as a temporary pass-through between your two devices.

import { put, list, del } from '@vercel/blob';

export const runtime = 'nodejs';
export const maxDuration = 30;

function isValidCode(code) {
  return typeof code === 'string' && /^[A-Za-z0-9]{6,10}$/.test(code);
}

// Vercel Functions (Hobby plan) cap request bodies around 4.5MB. Base64
// adds ~33% overhead, so keep the decoded image comfortably under that —
// send.html downscales/compresses the photo client-side before it ever
// gets here, so this should rarely trigger in normal use.
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      const { code, dataUrl } = req.body || {};
      if (!isValidCode(code) || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
        return res.status(400).json({ error: 'Invalid request' });
      }
      const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
      const buffer = Buffer.from(base64, 'base64');
      if (buffer.length > MAX_IMAGE_BYTES) {
        return res.status(413).json({ error: 'Image too large' });
      }
      await put(`sessions/${code}.jpg`, buffer, {
        access: 'public',
        addRandomSuffix: false,
        contentType: 'image/jpeg',
      });
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'GET') {
      const code = req.query.code;
      if (!isValidCode(code)) return res.status(400).json({ error: 'Invalid code' });
      const { blobs } = await list({ prefix: `sessions/${code}` });
      if (!blobs.length) return res.status(200).json({ ready: false });
      return res.status(200).json({ ready: true, url: blobs[0].url });
    }

    if (req.method === 'DELETE') {
      const { code } = req.body || {};
      if (!isValidCode(code)) return res.status(400).json({ error: 'Invalid code' });
      const { blobs } = await list({ prefix: `sessions/${code}` });
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
