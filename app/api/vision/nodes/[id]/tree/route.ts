import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/lib/auth'
import { visionDb, verifyNodeOwnership } from '@/lib/vision-db'

type Params = { params: Promise<{ id: string }> }

/**
 * GET /api/vision/nodes/[id]/tree
 * Get the recursive subtree rooted at a node.
 * Uses the vision.downstream_nodes() helper function to find all
 * descendant nodes, then returns them as a flat list with depth info.
 *
 * Query params:
 *   max_depth - Limit tree depth (default: unlimited)
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()

    const { id } = await params
    const db = await visionDb()

    if (!(await verifyNodeOwnership(db, id, user.id))) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 })
    }

    // Get the root node
    const { data: root } = await db.nodes()
      .select('*')
      .eq('id', id)
      .single()

    if (!root) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 })
    }

    // Use the downstream_nodes RPC to get all descendants
    const { data: descendants, error } = await db.supabase
      .schema('vision')
      .rpc('downstream_nodes', { start_node_id: id })

    if (error) {
      console.error('GET /api/vision/nodes/[id]/tree rpc error:', error)
      return NextResponse.json({ error: 'Failed to fetch tree' }, { status: 500 })
    }

    const maxDepth = parseInt(request.nextUrl.searchParams.get('max_depth') || '0')

    let filteredDescendants = descendants ?? []
    if (maxDepth > 0) {
      filteredDescendants = filteredDescendants.filter(
        (d: { node_id: string; depth: number }) => d.depth <= maxDepth
      )
    }

    // Fetch full node data for all descendants
    const descendantIds = filteredDescendants.map(
      (d: { node_id: string }) => d.node_id
    )
    const depthMap = new Map(
      filteredDescendants.map(
        (d: { node_id: string; depth: number }) => [d.node_id, d.depth]
      )
    )

    let nodes: Array<Record<string, unknown>> = []
    if (descendantIds.length > 0) {
      const { data: nodeData } = await db.nodes()
        .select('*')
        .in('id', descendantIds)

      nodes = (nodeData ?? []).map(n => ({
        ...n,
        depth: depthMap.get(n.id) ?? 0,
      }))
    }

    // Also fetch edges within this subtree for structure
    const allIds = [id, ...descendantIds]
    const { data: edges } = await db.edges()
      .select('*')
      .in('source_node_id', allIds)
      .in('target_node_id', allIds)

    return NextResponse.json({
      root,
      descendants: nodes,
      edges: edges ?? [],
      total: nodes.length + 1,
    })
  } catch (error) {
    console.error('GET /api/vision/nodes/[id]/tree error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
