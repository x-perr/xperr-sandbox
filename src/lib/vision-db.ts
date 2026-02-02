import { createSupabaseServer } from './supabase'

// Returns a Supabase client configured for the vision schema
export async function visionDb() {
  const supabase = await createSupabaseServer()
  return {
    supabase,
    nodes: () => supabase.schema('vision').from('nodes'),
    edges: () => supabase.schema('vision').from('edges'),
    sessions: () => supabase.schema('vision').from('sessions'),
    activity_log: () => supabase.schema('vision').from('activity_log'),
    blitzes: () => supabase.schema('vision').from('blitzes'),
    rpc: supabase.schema('vision').rpc.bind(supabase.schema('vision')),
  }
}

// Verify node ownership: node must belong to the given user
export async function verifyNodeOwnership(
  supabase: Awaited<ReturnType<typeof visionDb>>,
  nodeId: string,
  userId: string
): Promise<boolean> {
  const { data } = await supabase.nodes()
    .select('id')
    .eq('id', nodeId)
    .eq('user_id', userId)
    .single()
  return !!data
}

// Verify session ownership
export async function verifySessionOwnership(
  db: Awaited<ReturnType<typeof visionDb>>,
  sessionId: string,
  userId: string
): Promise<boolean> {
  const { data } = await db.sessions()
    .select('id')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single()
  return !!data
}

// Log activity in the vision schema
export async function logActivity(
  db: Awaited<ReturnType<typeof visionDb>>,
  params: {
    session_id: string
    user_id: string
    action: string
    target_type: string
    target_id: string
    details?: Record<string, unknown>
  }
) {
  await db.activity_log().insert({
    session_id: params.session_id,
    user_id: params.user_id,
    action: params.action,
    target_type: params.target_type,
    target_id: params.target_id,
    details: params.details ?? {},
  })
}
