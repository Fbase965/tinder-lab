// The web app manifest with the invite kept in start_url: an iPhone home-screen app doesn't share Safari's storage,
// so the ref must travel in the URL the installed app opens (src/App.jsx swaps the manifest link to this).
import { readFileSync } from 'node:fs'

const manifest = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'))

export default function handler(req, res) {
  const ref = String(req.query.ref ?? '').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 40)
  res.setHeader('Content-Type', 'application/manifest+json')
  res.send(JSON.stringify({ ...manifest, start_url: ref ? `/?ref=${ref}` : '/' }))
}
