import { requireLicense } from './access.js'
import { message, send, viewer } from './http.js'
import { readProject, writeProject, type ProjectKey } from './project.js'

export async function handleProject(req: any, res: any, key: ProjectKey) {
  try {
    const user = await viewer(req)
    if (req.method === 'GET') {
      const project = await readProject(user.id)
      const value = project[key] || null
      return send(res, 200, key === 'stickers' ? { files: [], stickers: value || {} } : key === 'model' ? { files: value?.file ? [value.file] : [], selected: value?.file || null, model: value } : { config: value })
    }
    if (req.method === 'POST' || req.method === 'PUT') {
      await requireLicense(user.id)
      const value = key === 'stickers' ? req.body?.stickers || {} : req.body
      await writeProject(user.id, key, value)
      return send(res, 200, {})
    }
    return send(res, 405, { error: 'Method not allowed' })
  } catch (error) {
    const text = message(error)
    return send(res, /登录|登录/.test(text) ? 401 : 403, { error: text })
  }
}
