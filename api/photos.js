// Vercel function: uploads (size + type checked) and deletes photos in Azure, only inside the caller's own folder.
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob'

const { AZURE_STORAGE_ACCOUNT: account, AZURE_STORAGE_KEY: key, VITE_SUPABASE_URL, VITE_SUPABASE_KEY } = process.env
const credential = new StorageSharedKeyCredential(account, key)
const container = new BlobServiceClient(`https://${account}.blob.core.windows.net`, credential).getContainerClient('photos')
const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_KEY)
const MAX_BYTES = 1024 * 1024 // client sends ~100 KB WebP; 1 MB leaves room for the JPEG fallback

// Trust the file's bytes, not the client's claimed type.
const kind = (b) =>
  b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? 'jpg'
  : b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' ? 'webp' : null

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const token = req.headers.authorization?.replace(/^Bearer /, '')
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return res.status(401).json({ error: 'Sessão inválida' })
  const uid = data.user.id
  // Upload: raw image bytes as application/octet-stream (Vercel parses that into a Buffer).
  if (Buffer.isBuffer(req.body)) {
    const bytes = req.body
    if (bytes.length > MAX_BYTES) return res.status(413).json({ error: 'Foto demasiado grande (máx. 1 MB)' })
    const ext = kind(bytes)
    if (!ext) return res.status(415).json({ error: 'Só JPEG ou WebP' })
    const name = `${uid}/${randomUUID()}.${ext}`
    await container.getBlockBlobClient(name).uploadData(bytes, {
      // file names are unique, so browsers can cache them for a year instead of re-downloading
      blobHTTPHeaders: { blobContentType: ext === 'jpg' ? 'image/jpeg' : 'image/webp', blobCacheControl: 'public, max-age=31536000, immutable' },
    })
    return res.json({ url: `${container.url}/${name}` })
  }

  const { remove } = req.body ?? {}
  if (Array.isArray(remove)) {
    const own = remove.filter((name) => typeof name === 'string' && name.startsWith(`${uid}/`) && !name.includes('..'))
    await Promise.all(own.map((name) => container.deleteBlob(name, { deleteSnapshots: 'include' }).catch(() => {})))
    return res.json({ removed: own.length })
  }
  res.status(400).json({ error: 'Pedido inválido' })
}
