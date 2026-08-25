# img29 Google Photos shared-link import

Project structure:

- `index.html` = the complete img29 editor
- `api/google-photos.js` = resolves a public Google Photos shared album into image URLs
- `api/google-photos-image.js` = same-origin image proxy used when the browser blocks direct Google CDN CORS
- `package.json` = Node dependency
- `vercel.json` = function duration configuration

Deploy the whole folder to Vercel, not just `index.html`.

The Google Photos button now asks for a public shared-album URL such as:
`https://photos.app.goo.gl/X35fp9p2DDiDUuE76`

No Google OAuth client, Google sign-in popup, or Google Photos Picker is used.
