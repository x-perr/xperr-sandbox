-- ============================================
-- VISION BOARD SCHEMA
-- 5 tables, indexes, RLS, helper functions,
-- moddatetime trigger, knowledge VIEW
-- ============================================

-- Schema
CREATE SCHEMA IF NOT EXISTS vision;

-- Enable moddatetime extension (for auto-updating updated_at)
CREATE EXTENSION IF NOT EXISTS moddatetime SCHEMA extensions;

-- ============================================
-- Table 1: sessions
-- A vision board session / workspace
-- ============================================
CREATE TABLE vision.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'completed')),
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vision_sessions_user ON vision.sessions(user_id);
CREATE INDEX idx_vision_sessions_status ON vision.sessions(user_id, status);

CREATE TRIGGER set_vision_sessions_updated_at
  BEFORE UPDATE ON vision.sessions
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

-- ============================================
-- Table 2: nodes
-- Individual items on the vision board
-- ============================================
CREATE TABLE vision.nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES vision.sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  node_type TEXT NOT NULL DEFAULT 'idea'
    CHECK (node_type IN ('goal', 'milestone', 'task', 'idea', 'note', 'resource')),
  label TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'blocked', 'cancelled')),
  priority INTEGER DEFAULT 0,
  color TEXT,
  position_x DOUBLE PRECISION NOT NULL DEFAULT 0,
  position_y DOUBLE PRECISION NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  due_date DATE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vision_nodes_session ON vision.nodes(session_id);
CREATE INDEX idx_vision_nodes_user ON vision.nodes(user_id);
CREATE INDEX idx_vision_nodes_type ON vision.nodes(session_id, node_type);
CREATE INDEX idx_vision_nodes_status ON vision.nodes(session_id, status);

CREATE TRIGGER set_vision_nodes_updated_at
  BEFORE UPDATE ON vision.nodes
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

-- ============================================
-- Table 3: edges
-- Connections between nodes (dependencies, associations)
-- ============================================
CREATE TABLE vision.edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES vision.sessions(id) ON DELETE CASCADE,
  source_node_id UUID NOT NULL REFERENCES vision.nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES vision.nodes(id) ON DELETE CASCADE,
  edge_type TEXT NOT NULL DEFAULT 'dependency'
    CHECK (edge_type IN ('dependency', 'association', 'hierarchy', 'sequence')),
  label TEXT,
  weight DOUBLE PRECISION DEFAULT 1.0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_vision_edge UNIQUE (session_id, source_node_id, target_node_id)
);

CREATE INDEX idx_vision_edges_session ON vision.edges(session_id);
CREATE INDEX idx_vision_edges_source ON vision.edges(source_node_id);
CREATE INDEX idx_vision_edges_target ON vision.edges(target_node_id);

-- ============================================
-- Table 4: activity_log
-- Audit trail of changes to the vision board
-- ============================================
CREATE TABLE vision.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES vision.sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL
    CHECK (action IN ('create', 'update', 'delete', 'move', 'connect', 'disconnect', 'status_change', 'blitz_start', 'blitz_end')),
  target_type TEXT NOT NULL
    CHECK (target_type IN ('node', 'edge', 'session', 'blitz')),
  target_id UUID NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vision_activity_session ON vision.activity_log(session_id);
CREATE INDEX idx_vision_activity_user ON vision.activity_log(user_id);
CREATE INDEX idx_vision_activity_created ON vision.activity_log(session_id, created_at DESC);
CREATE INDEX idx_vision_activity_target ON vision.activity_log(target_type, target_id);

-- ============================================
-- Table 5: blitzes
-- Focused work sprints on a subset of nodes
-- ============================================
CREATE TABLE vision.blitzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES vision.sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'active', 'completed', 'abandoned')),
  node_ids UUID[] NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  time_limit_minutes INTEGER,
  results JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vision_blitzes_session ON vision.blitzes(session_id);
CREATE INDEX idx_vision_blitzes_user ON vision.blitzes(user_id);
CREATE INDEX idx_vision_blitzes_status ON vision.blitzes(session_id, status);

CREATE TRIGGER set_vision_blitzes_updated_at
  BEFORE UPDATE ON vision.blitzes
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

-- ============================================
-- RLS Policies
-- Block cross-user access on all tables
-- ============================================

ALTER TABLE vision.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vision.nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE vision.edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE vision.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE vision.blitzes ENABLE ROW LEVEL SECURITY;

-- Sessions: user can only access their own
CREATE POLICY "sessions_owner_all" ON vision.sessions
  FOR ALL USING (user_id = auth.uid());

-- Nodes: user can only access nodes in their sessions
CREATE POLICY "nodes_owner_all" ON vision.nodes
  FOR ALL USING (user_id = auth.uid());

-- Edges: user can only access edges in their sessions
CREATE POLICY "edges_owner_all" ON vision.edges
  FOR ALL USING (
    session_id IN (
      SELECT id FROM vision.sessions WHERE user_id = auth.uid()
    )
  );

-- Activity log: user can only see activity in their sessions
CREATE POLICY "activity_log_owner_select" ON vision.activity_log
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "activity_log_owner_insert" ON vision.activity_log
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Blitzes: user can only access their own blitzes
CREATE POLICY "blitzes_owner_all" ON vision.blitzes
  FOR ALL USING (user_id = auth.uid());

-- Service role can do everything
CREATE POLICY "sessions_service" ON vision.sessions
  FOR ALL TO service_role USING (true);
CREATE POLICY "nodes_service" ON vision.nodes
  FOR ALL TO service_role USING (true);
CREATE POLICY "edges_service" ON vision.edges
  FOR ALL TO service_role USING (true);
CREATE POLICY "activity_log_service" ON vision.activity_log
  FOR ALL TO service_role USING (true);
CREATE POLICY "blitzes_service" ON vision.blitzes
  FOR ALL TO service_role USING (true);

-- Grants
GRANT USAGE ON SCHEMA vision TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA vision TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA vision TO service_role;

-- ============================================
-- Helper Function: downstream_nodes
-- Returns all nodes reachable from a given node
-- following edges in source -> target direction
-- ============================================
CREATE OR REPLACE FUNCTION vision.downstream_nodes(start_node_id UUID)
RETURNS TABLE(node_id UUID, depth INTEGER) AS $$
  WITH RECURSIVE downstream AS (
    -- Base case: direct children
    SELECT e.target_node_id AS node_id, 1 AS depth
    FROM vision.edges e
    WHERE e.source_node_id = start_node_id

    UNION

    -- Recursive case: children of children
    SELECT e.target_node_id, d.depth + 1
    FROM vision.edges e
    JOIN downstream d ON d.node_id = e.source_node_id
    WHERE d.depth < 100  -- safety limit
  )
  SELECT DISTINCT ON (downstream.node_id) downstream.node_id, downstream.depth
  FROM downstream
  ORDER BY downstream.node_id, downstream.depth;
$$ LANGUAGE sql STABLE;

-- ============================================
-- Helper Function: dep_depth
-- Returns the maximum dependency depth of a node
-- (longest path from any root to this node)
-- ============================================
CREATE OR REPLACE FUNCTION vision.dep_depth(target_node_id UUID)
RETURNS INTEGER AS $$
  WITH RECURSIVE ancestors AS (
    -- Base case: direct parents
    SELECT e.source_node_id AS node_id, 1 AS depth
    FROM vision.edges e
    WHERE e.target_node_id = target_node_id
      AND e.edge_type = 'dependency'

    UNION

    -- Recursive case: parents of parents
    SELECT e.source_node_id, a.depth + 1
    FROM vision.edges e
    JOIN ancestors a ON a.node_id = e.target_node_id
    WHERE e.edge_type = 'dependency'
      AND a.depth < 100  -- safety limit
  )
  SELECT COALESCE(MAX(ancestors.depth), 0)
  FROM ancestors;
$$ LANGUAGE sql STABLE;

-- ============================================
-- VIEW: knowledge
-- Aggregated view of nodes with dependency info
-- ============================================
CREATE OR REPLACE VIEW vision.knowledge AS
SELECT
  n.id,
  n.session_id,
  n.node_type,
  n.label,
  n.description,
  n.status,
  n.priority,
  n.due_date,
  n.created_at,
  n.updated_at,
  vision.dep_depth(n.id) AS dependency_depth,
  (SELECT count(*) FROM vision.edges e WHERE e.source_node_id = n.id) AS downstream_count,
  (SELECT count(*) FROM vision.edges e WHERE e.target_node_id = n.id) AS upstream_count,
  s.title AS session_title,
  s.user_id
FROM vision.nodes n
JOIN vision.sessions s ON n.session_id = s.id;
