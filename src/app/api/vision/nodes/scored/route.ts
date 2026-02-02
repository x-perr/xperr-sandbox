import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";

/**
 * GET /api/vision/nodes/scored
 *
 * Returns nodes with computed priority scores, adjusted by active blitz multiplier.
 *
 * Priority score formula:
 *   base_score = node.priority + downstream_count * 2 + dep_depth
 *   If node is in active blitz: final_score = base_score * blitz_multiplier (default 2x)
 *   Otherwise: final_score = base_score
 *
 * Query params:
 *   session_id        (required) - UUID of the vision session
 *   blitz_multiplier  (optional) - Multiplier for blitz nodes, default 2.0
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const sessionId = searchParams.get("session_id");

  if (!sessionId) {
    return NextResponse.json(
      { error: "session_id is required" },
      { status: 400 }
    );
  }

  const blitzMultiplier = parseFloat(
    searchParams.get("blitz_multiplier") ?? "2.0"
  );

  if (isNaN(blitzMultiplier) || blitzMultiplier <= 0) {
    return NextResponse.json(
      { error: "blitz_multiplier must be a positive number" },
      { status: 400 }
    );
  }

  // Get active blitz for this session to know which nodes are boosted
  const { data: blitzes } = await supabase
    .from("blitzes")
    .select("id, node_ids")
    .eq("session_id", sessionId)
    .eq("status", "active")
    .limit(1);

  const activeBlitz = blitzes?.[0] ?? null;
  const blitzNodeIds = new Set<string>(activeBlitz?.node_ids ?? []);

  // Use the knowledge view which already includes dep_depth and downstream_count
  const { data: nodes, error } = await supabase
    .from("knowledge")
    .select("*")
    .eq("session_id", sessionId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const scored = (nodes ?? []).map((node) => {
    const baseScore =
      (node.priority ?? 0) +
      (node.downstream_count ?? 0) * 2 +
      (node.dependency_depth ?? 0);

    const inBlitz = blitzNodeIds.has(node.id);
    const finalScore = inBlitz ? baseScore * blitzMultiplier : baseScore;

    return {
      id: node.id,
      session_id: node.session_id,
      node_type: node.node_type,
      label: node.label,
      description: node.description,
      status: node.status,
      priority: node.priority,
      due_date: node.due_date,
      dependency_depth: node.dependency_depth,
      downstream_count: node.downstream_count,
      upstream_count: node.upstream_count,
      base_score: baseScore,
      in_blitz: inBlitz,
      blitz_multiplier: inBlitz ? blitzMultiplier : 1,
      score: finalScore,
    };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  return NextResponse.json({
    data: scored,
    active_blitz_id: activeBlitz?.id ?? null,
    blitz_multiplier: blitzMultiplier,
  });
}
