import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";

/**
 * GET /api/vision/activity
 *
 * Returns paginated activity log entries for a session.
 *
 * Query params:
 *   session_id (required) - UUID of the vision session
 *   node_id    (optional) - Filter by target node
 *   event_type (optional) - Filter by action type (create, update, delete, etc.)
 *   page       (optional) - Page number, default 1
 *   per_page   (optional) - Items per page, default 20, max 100
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

  const nodeId = searchParams.get("node_id");
  const eventType = searchParams.get("event_type");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const perPage = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("per_page") ?? "20", 10))
  );

  const offset = (page - 1) * perPage;

  // Verify session ownership via RLS (query will return empty if not owned)
  let query = supabase
    .from("activity_log")
    .select("*", { count: "exact" })
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .range(offset, offset + perPage - 1);

  if (nodeId) {
    query = query.eq("target_id", nodeId);
  }

  if (eventType) {
    query = query.eq("action", eventType);
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data,
    pagination: {
      page,
      per_page: perPage,
      total: count ?? 0,
      total_pages: Math.ceil((count ?? 0) / perPage),
    },
  });
}
