import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/lib/auth'
import { visionDb, verifyNodeOwnership, logActivity } from '@/lib/vision-db'

type Params = { params: Promise<{ id: string }> }

const VALID_STATUSES = ['pending', 'in_progress', 'completed', 'blocked', 'cancelled']

/**
 * PATCH /api/vision/nodes/[id]/status
 * Change a node's status with hard dependency gating.
 *
 * When transitioning to "completed":
 *   - All hard dependencies (nodes this node depends on via 'dependency' edges)
 *     must already be completed. If not, the request is rejected.
 *
 * Body: { status: string }
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()

    const { id } = await params
    const body = await request.json()
    const { status } = body

    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      )
    }

    const db = await visionDb()

    if (!(await verifyNodeOwnership(db, id, user.id))) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 })
    }

    // Hard dependency gate: block completion if dependencies aren't met
    if (status === 'completed') {
      // Find all nodes this node depends on (hard deps: edges where
      // this node is the target and edge_type is 'dependency')
      const { data: depEdges } = await db.edges()
        .select('source_node_id')
        .eq('target_node_id', id)
        .eq('edge_type', 'dependency')

      if (depEdges?.length) {
        const depNodeIds = depEdges.map(e => e.source_node_id)
        const { data: depNodes } = await db.nodes()
          .select('id, label, status')
          .in('id', depNodeIds)

        const unmet = depNodes?.filter(n => n.status !== 'completed') ?? []
        if (unmet.length > 0) {
          return NextResponse.json({
            error: 'Cannot complete: unmet hard dependencies',
            unmet_dependencies: unmet.map(n => ({
              id: n.id,
              label: n.label,
              status: n.status,
            })),
          }, { status: 409 })
        }
      }
    }

    // Get current status for activity log
    const { data: current } = await db.nodes()
      .select('status, session_id')
      .eq('id', id)
      .single()

    const updates: Record<string, unknown> = { status }
    if (status === 'completed') {
      updates.completed_at = new Date().toISOString()
    } else if (current?.status === 'completed') {
      // Un-completing: clear completed_at
      updates.completed_at = null
    }

    const { data: node, error } = await db.nodes()
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('PATCH /api/vision/nodes/[id]/status error:', error)
      return NextResponse.json({ error: 'Failed to update status' }, { status: 500 })
    }

    await logActivity(db, {
      session_id: node.session_id,
      user_id: user.id,
      action: 'status_change',
      target_type: 'node',
      target_id: id,
      details: {
        from: current?.status,
        to: status,
      },
    })

    return NextResponse.json({ data: node })
  } catch (error) {
    console.error('PATCH /api/vision/nodes/[id]/status error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
