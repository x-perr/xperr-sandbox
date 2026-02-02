import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/lib/auth'
import { visionDb, verifyNodeOwnership, logActivity } from '@/lib/vision-db'

type Params = { params: Promise<{ id: string }> }

/**
 * GET /api/vision/nodes/[id]
 * Get a single node by ID.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()

    const { id } = await params
    const db = await visionDb()

    const { data: node, error } = await db.nodes()
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (error || !node) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 })
    }

    return NextResponse.json({ data: node })
  } catch (error) {
    console.error('GET /api/vision/nodes/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/vision/nodes/[id]
 * Update a node's fields (not status - use /status endpoint for that).
 *
 * Body: { label?, description?, node_type?, priority?, color?,
 *         position_x?, position_y?, metadata?, due_date? }
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()

    const { id } = await params
    const db = await visionDb()

    if (!(await verifyNodeOwnership(db, id, user.id))) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 })
    }

    const body = await request.json()
    const allowedFields = [
      'label', 'description', 'node_type', 'priority', 'color',
      'position_x', 'position_y', 'metadata', 'due_date',
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

    const { data: node, error } = await db.nodes()
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('PATCH /api/vision/nodes/[id] error:', error)
      return NextResponse.json({ error: 'Failed to update node' }, { status: 500 })
    }

    await logActivity(db, {
      session_id: node.session_id,
      user_id: user.id,
      action: 'update',
      target_type: 'node',
      target_id: id,
      details: { updated_fields: Object.keys(updates) },
    })

    return NextResponse.json({ data: node })
  } catch (error) {
    console.error('PATCH /api/vision/nodes/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/vision/nodes/[id]
 * Delete a node. Re-parents children: any edge where this node is the target
 * gets its children (edges where this node is source) re-pointed to the parent.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()

    const { id } = await params
    const db = await visionDb()

    // Fetch the node to verify ownership and get session_id
    const { data: node } = await db.nodes()
      .select('id, session_id, label')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (!node) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 })
    }

    // Re-parent children before deleting:
    // Find parent edges (where this node is the target)
    const { data: parentEdges } = await db.edges()
      .select('source_node_id, edge_type')
      .eq('target_node_id', id)

    // Find child edges (where this node is the source)
    const { data: childEdges } = await db.edges()
      .select('target_node_id, edge_type')
      .eq('source_node_id', id)

    // Re-parent: connect each parent to each child
    if (parentEdges?.length && childEdges?.length) {
      const newEdges = []
      for (const parent of parentEdges) {
        for (const child of childEdges) {
          // Only re-parent edges of matching type
          if (parent.edge_type === child.edge_type) {
            newEdges.push({
              session_id: node.session_id,
              source_node_id: parent.source_node_id,
              target_node_id: child.target_node_id,
              edge_type: parent.edge_type,
            })
          }
        }
      }
      if (newEdges.length) {
        // upsert to avoid unique constraint violations
        await db.edges().upsert(newEdges, {
          onConflict: 'session_id,source_node_id,target_node_id',
        })
      }
    }

    // Delete the node (cascade will remove its edges)
    const { error } = await db.nodes()
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('DELETE /api/vision/nodes/[id] error:', error)
      return NextResponse.json({ error: 'Failed to delete node' }, { status: 500 })
    }

    await logActivity(db, {
      session_id: node.session_id,
      user_id: user.id,
      action: 'delete',
      target_type: 'node',
      target_id: id,
      details: {
        label: node.label,
        reparented_children: childEdges?.length ?? 0,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/vision/nodes/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
