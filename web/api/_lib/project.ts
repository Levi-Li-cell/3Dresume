import { supabase } from './http.js'

export type ProjectKey = 'profile' | 'director' | 'stickers' | 'model'

export async function readProject(userId: string) {
  const db = supabase()
  const { data, error } = await db.from('sen_projects').select('*').eq('user_id', userId).maybeSingle()
  if (error) throw error
  if (data) return data
  const { data: created, error: createError } = await db.from('sen_projects').insert({ user_id: userId }).select('*').single()
  if (createError) throw createError
  return created
}

export async function writeProject(userId: string, key: ProjectKey, value: unknown) {
  await readProject(userId)
  const { error } = await supabase().from('sen_projects').update({ [key]: value, updated_at: new Date().toISOString() }).eq('user_id', userId)
  if (error) throw error
}
