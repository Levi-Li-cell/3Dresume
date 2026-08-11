import { put } from '@vercel/blob'
import { requireLicense } from '../_lib/access.js'
import { message, send, viewer } from '../_lib/http.js'
import { readProject, writeProject } from '../_lib/project.js'

const types: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

function validImage(type: string, body: Buffer) {
  if (type === 'image/png') return body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  if (type === 'image/jpeg') return body.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
  return body.subarray(0, 4).toString('ascii') === 'RIFF' && body.subarray(8, 12).toString('ascii') === 'WEBP'
}

export const config = { api: { bodyParser: false } }
export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' })
    const user = await viewer(req)
    await requireLicense(user.id)
    const contentType = String(req.headers['content-type'] || '').split(';')[0].toLowerCase()
    const extension = types[contentType]
    if (!extension) return send(res, 400, { error: '仅支持 PNG、JPG 或 WebP 贴纸' })
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(Buffer.from(chunk))
    const file = Buffer.concat(chunks)
    if (!file.length || file.length > 10 * 1024 * 1024 || !validImage(contentType, file)) return send(res, 400, { error: '贴纸必须是有效且小于 10 MB 的图片文件' })
    const displayName = decodeURIComponent(String(req.headers['x-file-name'] || `sticker.${extension}`)).replace(/[^\w. -]/g, '').slice(0, 96)
    const blob = await put(`sen-3d/${user.id}/stickers/${displayName || `sticker.${extension}`}`, file, { access: 'public', addRandomSuffix: true, contentType })
    const project = await readProject(user.id)
    const stickers = typeof project.stickers === 'object' && project.stickers ? { ...project.stickers } : {}
    const id = blob.pathname.split('/').pop() || `${Date.now()}.${extension}`
    stickers[id] = { position: [0, 0.6, 0.27], rotation: [0, 0, 0], scale: 0.12, assetUrl: blob.url, originalName: displayName }
    await writeProject(user.id, 'stickers', stickers)
    return send(res, 201, { sticker: { id, ...stickers[id] } })
  } catch (error) { return send(res, 400, { error: message(error) }) }
}
