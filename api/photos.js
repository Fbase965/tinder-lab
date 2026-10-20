// Vercel function: hands out short-lived Azure upload URLs and deletes photos, only inside the caller's own folder.
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { BlobSASPermissions, BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters } from '@azure/storage-blob'

const { AZURE_STORAGE_ACCOUNT: account, AZURE_STORAGE_KEY: key, VITE_SUPABASE_URL, VITE_SUPABASE_KEY } = process.env
const credential = new StorageSharedKeyCredential(account, key)
const container = new BlobServiceClient(`https://${account}.blob.core.windows.net`, credential).getContainerClient('photos')
const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_KEY)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const token = req.headers.authorization?.replace(/^Bearer /, '')
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return res.status(401).json({ error: 'Sessão inválida' })
  const uid = data.user.id
  const { ext, remove } = req.body ?? {}

  if (Array.isArray(remove)) {
    const own = remove.filter((name) => typeof name === 'string' && name.startsWith(`${uid}/`) && !name.includes('..'))
    await Promise.all(own.map((name) => container.deleteBlob(name, { deleteSnapshots: 'include' }).catch(() => {})))
    return res.json({ removed: own.length })
  }

  // shortcut: SAS cannot cap file size, the client compresses; add a size check job if abuse shows up
  const name = `${uid}/${randomUUID()}.${ext === 'jpg' ? 'jpg' : 'webp'}`
  const sas = generateBlobSASQueryParameters({
    containerName: 'photos', blobName: name, permissions: BlobSASPermissions.parse('cw'),
    startsOn: new Date(Date.now() - 60_000), expiresOn: new Date(Date.now() + 5 * 60_000),
  }, credential)
  const publicUrl = `${container.url}/${name}`
  res.json({ uploadUrl: `${publicUrl}?${sas}`, publicUrl })
}
