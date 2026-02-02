import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/lib/auth'
import { visionDb, verifySessionOwnership, logActivity } from '@/lib/vision-db'

type Params = { params: Promise<{ id: string }> }

const VALID_STATUSES = ['planned', 'active', 'completed', 'abandoned']

/**
 * GET /api/vision/blitzes/[id]
 * Get a single blitz by ID.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()

    const { id } = await params
    const db = await visionDb()

    const { data: blitz, error } = await db.blitzes()
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (error || !blitz) {
      return NextResponse.json({ error: 'Blitz not found' }, { status: 404 })
    }

    return NextResponse.json({ data: blitz })
  } catch (error) {
    console.error('GET /api/vision/blitzes/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/vision/blitzes/[id]
 * Update a blitz. Enforces single active blitz per session.
 *
 * When transitioning to "active", any existing active blitz in the
 * same session is rejected (must complete/abandon the current one first).
 *
 * Body: { title?, description?, status?, node_ids?, time_limit_minutes?, results? }
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()

    const { id } = await params
    const db = await visionDb()

    // Fetch current blitz
    const { data: current } = await db.blitzes()
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (!current) {
      return NextResponse.json({ error: 'Blitz not found' }, { status: 404 })
    }

    const body = await request.json()

    const allowedFields = [
      'title', 'description', 'status', 'node_ids',
      'time_limit_minutes', 'results',
    ]
    const updates: Record<string, unknown> = {}
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field]
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const newStatus = updates.status as string | undefined

    if (newStatus && !VALID_STATUSES.includes(newStatus)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      )
    }

    // Enforce single active blitz per session
    if (newStatus === 'active' && current.status !== 'active') {
      const { data: activeBlitzes } = await db.blitzes()
        .select('id, title')
        .eq('session_id', current.session_id)
        .eq('status', 'active')
        .neq('id', id)
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
      updates.started_at = new Date().toISOString()
    }

    // Set completed_at when finishing
    if (newStatus === 'completed' || newStatus === 'abandoned') {
      updates.completed_at = new Date().toISOString()
    }

    const { data: blitz, error } = await db.blitzes()
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('PATCH /api/vision/blitzes/[id] error:', error)
      return NextResponse.json({ error: 'Failed to update blitz' }, { status: 500 })
    }

    // Log appropriate activity
    let action = 'update'
    if (newStatus === 'active' && current.status !== 'active') {
      action = 'blitz_start'
    } else if (
      (newStatus === 'completed' || newStatus === 'abandoned') &&
      current.status === 'active'
    ) {
      action = 'blitz_end'
    }

    await logActivity(db, {
      session_id: current.session_id,
      user_id: user.id,
      action,
      target_type: 'blitz',
      target_id: id,
      details: {
        updated_fields: Object.keys(updates),
        ...(newStatus ? { from: current.status, to: newStatus } : {}),
      },
    })

    return NextResponse.json({ data: blitz })
  } catch (error) {
    console.error('PATCH /api/vision/blitzes/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/vision/blitzes/[id]
 * Delete a blitz.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()

    const { id } = await params
    const db = await visionDb()

    const { data: blitz } = await db.blitzes()
      .select('id, session_id, title, status')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (!blitz) {
      return NextResponse.json({ error: 'Blitz not found' }, { status: 404 })
    }

    // If deleting an active blitz, log blitz_end
    if (blitz.status === 'active') {
      await logActivity(db, {
        session_id: blitz.session_id,
        user_id: user.id,
        action: 'blitz_end',
        target_type: 'blitz',
        target_id: id,
        details: { title: blitz.title, reason: 'deleted' },
      })
    }

    const { error } = await db.blitzes()
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('DELETE /api/vision/blitzes/[id] error:', error)
      return NextResponse.json({ error: 'Failed to delete blitz' }, { status: 500 })
    }

    await logActivity(db, {
      session_id: blitz.session_id,
      user_id: user.id,
      action: 'delete',
      target_type: 'blitz',
      target_id: id,
      details: { title: blitz.title },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/vision/blitzes/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
