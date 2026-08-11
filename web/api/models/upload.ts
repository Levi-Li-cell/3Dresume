import { handleUpload } from '@vercel/blob/client'
import { requireLicense } from '../_lib/access.js'
import { message, send, viewer } from '../_lib/http.js'
import { writeProject } from '../_lib/project.js'

const safeName = (value: string) => value.replace(/[^\w. -]/g, '').replace(/\s+/g, '-').slice(0, 120)

async function persistUpload(blob: { pathname: string; url: string }, tokenPayload?: string | null) {
  const payload = JSON.parse(tokenPayload || '{}') as { userId?: string; originalName?: string }
  if (!payload.userId) throw new Error('Missing upload payload')
  await writeProject(payload.userId, 'model', { file: blob.pathname.split('/').pop(), originalName: payload.originalName, url: blob.url, size: 0 })
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' })
    if (req.body?.type === 'blob.upload-completed') {
      const result = await handleUpload({ request: req, body: req.body, onBeforeGenerateToken: async () => { throw new Error('Unexpected token request') }, onUploadCompleted: async ({ blob, tokenPayload }) => persistUpload(blob, tokenPayload) })
      return res.status(200).json(result)
    }
    const user = await viewer(req)
    await requireLicense(user.id)
    const result = await handleUpload({
      request: req,
      body: req.body,
      onBeforeGenerateToken: async (pathname) => {
        const prefix = `sen-3d/${user.id}/models/`
        if (!pathname.startsWith(prefix) || !/\.glb$/i.test(pathname)) throw new Error('仅支持当前项目目录内的 .glb 文件')
        return { allowedContentTypes: ['model/gltf-binary', 'application/octet-stream'], maximumSizeInBytes: 50 * 1024 * 1024, addRandomSuffix: true, tokenPayload: JSON.stringify({ userId: user.id, originalName: safeName(pathname.slice(prefix.length)) }) }
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => persistUpload(blob, tokenPayload),
    })
    return res.status(200).json(result)
  } catch (error) { return send(res, 400, { error: message(error) }) }
}
