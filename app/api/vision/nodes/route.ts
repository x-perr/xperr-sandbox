import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/lib/auth'
import { visionDb, logActivity } from '@/lib/vision-db'

/**
 * GET /api/vision/nodes
 * List nodes for a session with optional filters.
 *
 * Query params:
 *   session_id (required) - Vision session UUID
 *   status     - Filter by status (comma-separated)
 *   node_type  - Filter by type (comma-separated)
 *   limit      - Max results (default 100)
 *   offset     - Pagination offset (default 0)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()

    const params = request.nextUrl.searchParams
    const sessionId = params.get('session_id')
    if (!sessionId) {
      return NextResponse.json({ error: 'session_id is required' }, { status: 400 })
    }

    const db = await visionDb()

    // Verify session ownership
    const { data: session } = await db.sessions()
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single()
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    let query = db.nodes()
      .select('*')
      .eq('session_id', sessionId)

    const status = params.get('status')
    if (status) {
      query = query.in('status', status.split(','))
    }

    const nodeType = params.get('node_type')
    if (nodeType) {
      query = query.in('node_type', nodeType.split(','))
    }

    const limit = parseInt(params.get('limit') || '100')
    const offset = parseInt(params.get('offset') || '0')
    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1)

    const { data, error } = await query
    if (error) {
      console.error('GET /api/vision/nodes error:', error)
      return NextResponse.json({ error: 'Failed to fetch nodes' }, { status: 500 })
    }

    return NextResponse.json({ data, count: data.length })
  } catch (error) {
    console.error('GET /api/vision/nodes error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/vision/nodes
 * Create a new node.
 *
 * Body: { session_id, label, node_type?, description?, priority?, color?,
 *         position_x?, position_y?, metadata?, due_date? }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()

    const body = await request.json()
    const { session_id, label } = body

    if (!session_id || !label) {
      return NextResponse.json(
        { error: 'session_id and label are required' },
        { status: 400 }
      )
    }

    const db = await visionDb()

    // Verify session ownership
    const { data: session } = await db.sessions()
      .select('id')
      .eq('id', session_id)
      .eq('user_id', user.id)
      .single()
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const { data: node, error } = await db.nodes().insert({
      session_id,
      user_id: user.id,
      label,
      node_type: body.node_type || 'idea',
      description: body.description || null,
      status: 'pending',
      priority: body.priority ?? 0,
      color: body.color || null,
      position_x: body.position_x ?? 0,
      position_y: body.position_y ?? 0,
      metadata: body.metadata ?? {},
      due_date: body.due_date || null,
    }).select().single()

    if (error) {
      console.error('POST /api/vision/nodes error:', error)
      return NextResponse.json({ error: 'Failed to create node' }, { status: 500 })
    }

    await logActivity(db, {
      session_id,
      user_id: user.id,
      action: 'create',
      target_type: 'node',
      target_id: node.id,
      details: { label, node_type: node.node_type },
    })

    return NextResponse.json({ data: node }, { status: 201 })
  } catch (error) {
    console.error('POST /api/vision/nodes error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
