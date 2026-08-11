import { requireLicense } from '../_lib/access.js'
import { message, send, viewer } from '../_lib/http.js'
import { readProject, writeProject, type ProjectKey } from '../_lib/project.js'

const allowed = new Set<ProjectKey>(['profile', 'director', 'stickers', 'model'])
export default async function handler(req: any, res: any) {
  try {
    const user = await viewer(req); const key = String(req.query.section || '') as ProjectKey
    if (!allowed.has(key)) return send(res, 404, { error: 'Unknown project section' })
    if (req.method === 'GET') { const project = await readProject(user.id); const value = project[key] || null; return send(res, 200, key === 'stickers' ? { files: [], stickers: value || {} } : { config: value, model: value }) }
    if (req.method === 'PUT') { await requireLicense(user.id); const value = key === 'stickers' ? req.body?.stickers || {} : req.body; await writeProject(user.id, key, value); return send(res, 200, {}) }
    return send(res, 405, { error: 'Method not allowed' })
  } catch (error) { send(res, 401, { error: message(error) }) }
}
