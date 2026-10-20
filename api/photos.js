// Vercel function: uploads (size + type checked) and deletes photos in Azure, only inside the caller's own folder.
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob'

const { AZURE_STORAGE_ACCOUNT: account, AZURE_STORAGE_KEY: key, VITE_SUPABASE_URL, VITE_SUPABASE_KEY } = process.env
const credential = new StorageSharedKeyCredential(account, key)
const container = new BlobServiceClient(`https://${account}.blob.core.windows.net`, credential).getContainerClient('photos')
const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_KEY)
const MAX_BYTES = 1024 * 1024 // client sends ~100 KB WebP; 1 MB leaves room for the JPEG fallback
const MAX_FILES = 12 // 6 on the profile plus room for uploads not saved yet

const list = async (uid) => {
  const blobs = []
  for await (const b of container.listBlobsFlat({ prefix: `${uid}/` })) blobs.push(b)
  return blobs
}

// Uploads never saved to the profile (closed form, failed save) are deleted once they are an hour old.
async function dropOrphans(uid, token, blobs) {
  const asUser = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } })
  const { data } = await asUser.from('profiles').select('photos').eq('id', uid).maybeSingle()
  const used = new Set((data?.photos ?? []).map((u) => u.split('/photos/')[1]))
  const old = blobs.filter((b) => !used.has(b.name) && Date.now() - b.properties.createdOn > 3600e3)
  await Promise.all(old.map((b) => container.deleteBlob(b.name).catch(() => {})))
  return blobs.length - old.length
}

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
    const blobs = await list(uid)
    if (blobs.length >= MAX_FILES && (await dropOrphans(uid, token, blobs)) >= MAX_FILES) {
      return res.status(429).json({ error: 'Limite de fotos atingido. Guarda o perfil e tenta daqui a uma hora.' })
    }
    const name = `${uid}/${randomUUID()}.${ext}`
    await container.getBlockBlobClient(name).uploadData(bytes, {
      // file names are unique, so browsers can cache them for a year instead of re-downloading
      blobHTTPHeaders: { blobContentType: ext === 'jpg' ? 'image/jpeg' : 'image/webp', blobCacheControl: 'public, max-age=31536000, immutable' },
    })
    return res.json({ url: `${container.url}/${name}` })
  }

  const { remove, removeAll } = req.body ?? {}
  if (removeAll === true) { // account deletion
    const blobs = await list(uid)
    await Promise.all(blobs.map((b) => container.deleteBlob(b.name, { deleteSnapshots: 'include' }).catch(() => {})))
    return res.json({ removed: blobs.length })
  }
  if (Array.isArray(remove)) {
    const own = remove.filter((name) => typeof name === 'string' && name.startsWith(`${uid}/`) && !name.includes('..'))
    await Promise.all(own.map((name) => container.deleteBlob(name, { deleteSnapshots: 'include' }).catch(() => {})))
    return res.json({ removed: own.length })
  }
  res.status(400).json({ error: 'Pedido inválido' })
}
