export type NodeType = 'goal' | 'milestone' | 'task' | 'idea' | 'note' | 'resource'
export type NodeStatus = 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled'

export interface VisionNode {
  id: string
  session_id: string
  user_id: string
  node_type: NodeType
  label: string
  description: string | null
  status: NodeStatus
  priority: number
  color: string | null
  position_x: number
  position_y: number
  metadata: Record<string, unknown>
  due_date: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface ScoredNode extends VisionNode {
  dependency_depth: number
  downstream_count: number
  upstream_count: number
  base_score: number
  in_blitz: boolean
  blitz_multiplier: number
  score: number
}

export interface NodeCardData {
  node: ScoredNode
  /** Number of children completed / total */
  childProgress: { completed: number; total: number }
  /** Tags from metadata */
  tags: string[]
  /** Whether this node has unresolved upstream dependencies */
  isLocked: boolean
  /** Number of nodes this unlocks (downstream_count) */
  unlocksCount: number
  /** Whether this node has a warning (e.g. overdue) */
  hasWarning: boolean
}
