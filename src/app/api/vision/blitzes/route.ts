import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/lib/auth'
import { visionDb, verifySessionOwnership, logActivity } from '@/lib/vision-db'

const VALID_STATUSES = ['planned', 'active', 'completed', 'abandoned']

/**
 * GET /api/vision/blitzes
 * List blitzes for a session.
 *
 * Query params:
 *   session_id (required) - Vision session UUID
 *   status     (optional) - Filter by status
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

    if (!(await verifySessionOwnership(db, sessionId, user.id))) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    let query = db.blitzes()
      .select('*')
      .eq('session_id', sessionId)

    const status = params.get('status')
    if (status) {
      query = query.eq('status', status)
    }

    query = query.order('created_at', { ascending: false })

    const { data, error } = await query
    if (error) {
      console.error('GET /api/vision/blitzes error:', error)
      return NextResponse.json({ error: 'Failed to fetch blitzes' }, { status: 500 })
    }

    return NextResponse.json({ data, count: data.length })
  } catch (error) {
    console.error('GET /api/vision/blitzes error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/vision/blitzes
 * Create a new blitz. Enforces single active blitz per session.
 *
 * Body: { session_id, title, description?, node_ids?, status?,
 *         time_limit_minutes?, results? }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()

    const body = await request.json()
    const { session_id, title } = body

    if (!session_id || !title) {
      return NextResponse.json(
        { error: 'session_id and title are required' },
        { status: 400 }
      )
    }

    const status = body.status || 'planned'
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      )
    }

    const db = await visionDb()

    if (!(await verifySessionOwnership(db, session_id, user.id))) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Enforce single active blitz per session
    if (status === 'active') {
      const { data: activeBlitzes } = await db.blitzes()
        .select('id, title')
        .eq('session_id', session_id)
        .eq('status', 'active')
        .limit(1)

      if (activeBlitzes?.length) {
        return NextResponse.json(
          {
            error: 'Only one active blitz allowed per session',
            active_blitz: activeBlitzes[0],
          },
          { status: 409 }
        )
      }
    }

    const { data: blitz, error } = await db.blitzes().insert({
      session_id,
      user_id: user.id,
      title,
      description: body.description || null,
      status,
      node_ids: body.node_ids ?? [],
      started_at: status === 'active' ? new Date().toISOString() : null,
      time_limit_minutes: body.time_limit_minutes || null,
      results: body.results ?? {},
    }).select().single()

    if (error) {
      console.error('POST /api/vision/blitzes error:', error)
      return NextResponse.json({ error: 'Failed to create blitz' }, { status: 500 })
    }

    const action = status === 'active' ? 'blitz_start' : 'create'
    await logActivity(db, {
      session_id,
      user_id: user.id,
      action,
      target_type: 'blitz',
      target_id: blitz.id,
      details: { title, node_count: (body.node_ids ?? []).length },
    })

    return NextResponse.json({ data: blitz }, { status: 201 })
  } catch (error) {
    console.error('POST /api/vision/blitzes error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
