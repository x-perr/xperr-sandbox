import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/lib/auth'
import { visionDb, verifySessionOwnership, logActivity } from '@/lib/vision-db'

const VALID_EDGE_TYPES = ['dependency', 'association', 'hierarchy', 'sequence']

/**
 * GET /api/vision/edges
 * List edges for a session with optional filters.
 *
 * Query params:
 *   session_id  (required) - Vision session UUID
 *   edge_type   (optional) - Filter by type
 *   node_id     (optional) - Filter edges connected to a specific node (source or target)
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

    let query = db.edges()
      .select('*')
      .eq('session_id', sessionId)

    const edgeType = params.get('edge_type')
    if (edgeType) {
      query = query.eq('edge_type', edgeType)
    }

    const nodeId = params.get('node_id')
    if (nodeId) {
      query = query.or(`source_node_id.eq.${nodeId},target_node_id.eq.${nodeId}`)
    }

    query = query.order('created_at', { ascending: false })

    const { data, error } = await query
    if (error) {
      console.error('GET /api/vision/edges error:', error)
      return NextResponse.json({ error: 'Failed to fetch edges' }, { status: 500 })
    }

    return NextResponse.json({ data, count: data.length })
  } catch (error) {
    console.error('GET /api/vision/edges error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/vision/edges
 * Create a new edge between two nodes.
 *
 * For dependency edges (hard_dep), cycle detection is enforced:
 * creating A -> B as dependency is rejected if B already has a
 * path to A (which would create a cycle).
 *
 * Body: { session_id, source_node_id, target_node_id, edge_type?, label?, weight?, metadata? }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()

    const body = await request.json()
    const { session_id, source_node_id, target_node_id } = body

    if (!session_id || !source_node_id || !target_node_id) {
      return NextResponse.json(
        { error: 'session_id, source_node_id, and target_node_id are required' },
        { status: 400 }
      )
    }

    if (source_node_id === target_node_id) {
      return NextResponse.json(
        { error: 'Cannot create self-referencing edge' },
        { status: 400 }
      )
    }

    const edgeType = body.edge_type || 'dependency'
    if (!VALID_EDGE_TYPES.includes(edgeType)) {
      return NextResponse.json(
        { error: `Invalid edge_type. Must be one of: ${VALID_EDGE_TYPES.join(', ')}` },
        { status: 400 }
      )
    }

    const db = await visionDb()

    if (!(await verifySessionOwnership(db, session_id, user.id))) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Verify both nodes exist and belong to this session
    const { data: sourceNode } = await db.nodes()
      .select('id')
      .eq('id', source_node_id)
      .eq('session_id', session_id)
      .eq('user_id', user.id)
      .single()

    const { data: targetNode } = await db.nodes()
      .select('id')
      .eq('id', target_node_id)
      .eq('session_id', session_id)
      .eq('user_id', user.id)
      .single()

    if (!sourceNode || !targetNode) {
      return NextResponse.json(
        { error: 'One or both nodes not found in this session' },
        { status: 404 }
      )
    }

    // Cycle detection for dependency edges
    if (edgeType === 'dependency') {
      const hasCycle = await wouldCreateCycle(db, session_id, source_node_id, target_node_id)
      if (hasCycle) {
        return NextResponse.json(
          { error: 'Cannot create dependency edge: would create a cycle' },
          { status: 409 }
        )
      }
    }

    const { data: edge, error } = await db.edges().insert({
      session_id,
      source_node_id,
      target_node_id,
      edge_type: edgeType,
      label: body.label || null,
      weight: body.weight ?? 1.0,
      metadata: body.metadata ?? {},
    }).select().single()

    if (error) {
      // Unique constraint violation
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Edge already exists between these nodes in this session' },
          { status: 409 }
        )
      }
      console.error('POST /api/vision/edges error:', error)
      return NextResponse.json({ error: 'Failed to create edge' }, { status: 500 })
    }

    await logActivity(db, {
      session_id,
      user_id: user.id,
      action: 'connect',
      target_type: 'edge',
      target_id: edge.id,
      details: {
        source_node_id,
        target_node_id,
        edge_type: edgeType,
      },
    })

    return NextResponse.json({ data: edge }, { status: 201 })
  } catch (error) {
    console.error('POST /api/vision/edges error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/vision/edges
 * Delete an edge by ID.
 *
 * Query params:
 *   id (required) - Edge UUID
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()

    const edgeId = request.nextUrl.searchParams.get('id')
    if (!edgeId) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const db = await visionDb()

    // Fetch edge to verify ownership (via session)
    const { data: edge } = await db.edges()
      .select('id, session_id, source_node_id, target_node_id, edge_type')
      .eq('id', edgeId)
      .single()

    if (!edge) {
      return NextResponse.json({ error: 'Edge not found' }, { status: 404 })
    }

    if (!(await verifySessionOwnership(db, edge.session_id, user.id))) {
      return NextResponse.json({ error: 'Edge not found' }, { status: 404 })
    }

    const { error } = await db.edges()
      .delete()
      .eq('id', edgeId)

    if (error) {
      console.error('DELETE /api/vision/edges error:', error)
      return NextResponse.json({ error: 'Failed to delete edge' }, { status: 500 })
    }

    await logActivity(db, {
      session_id: edge.session_id,
      user_id: user.id,
      action: 'disconnect',
      target_type: 'edge',
      target_id: edgeId,
      details: {
        source_node_id: edge.source_node_id,
        target_node_id: edge.target_node_id,
        edge_type: edge.edge_type,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/vision/edges error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Cycle detection: check if adding source_node_id -> target_node_id
 * as a dependency would create a cycle.
 *
 * A cycle exists if target_node_id can already reach source_node_id
 * via existing dependency edges. We use BFS from target following
 * dependency edges in the source->target direction.
 */
async function wouldCreateCycle(
  db: Awaited<ReturnType<typeof visionDb>>,
  sessionId: string,
  sourceNodeId: string,
  targetNodeId: string
): Promise<boolean> {
  // Use the downstream_nodes RPC: if source is reachable from target,
  // adding target->source direction (source depends on target) would cycle.
  // But our edge is source_node_id -> target_node_id (source depends on target).
  // A cycle exists if target_node_id already has a path to source_node_id
  // following existing dependency edges in source->target direction.
  //
  // We do BFS manually since downstream_nodes follows ALL edge types.

  const { data: allDepEdges } = await db.edges()
    .select('source_node_id, target_node_id')
    .eq('session_id', sessionId)
    .eq('edge_type', 'dependency')

  if (!allDepEdges?.length) return false

  // Build adjacency list: source -> [targets]
  const adj = new Map<string, string[]>()
  for (const e of allDepEdges) {
    const targets = adj.get(e.source_node_id) ?? []
    targets.push(e.target_node_id)
    adj.set(e.source_node_id, targets)
  }

  // BFS from target_node_id: can we reach source_node_id?
  const visited = new Set<string>()
  const queue = [targetNodeId]
  visited.add(targetNodeId)

  while (queue.length > 0) {
    const current = queue.shift()!
    const neighbors = adj.get(current) ?? []
    for (const neighbor of neighbors) {
      if (neighbor === sourceNodeId) return true
      if (!visited.has(neighbor)) {
        visited.add(neighbor)
        queue.push(neighbor)
      }
    }
  }

  return false
}
