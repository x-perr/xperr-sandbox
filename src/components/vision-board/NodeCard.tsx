'use client'

import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { NodeCardData, NodeStatus, NodeType } from '@/types/vision'

const NODE_TYPE_LABELS: Record<NodeType, string> = {
  goal: 'Goal',
  milestone: 'Milestone',
  task: 'Task',
  idea: 'Idea',
  note: 'Note',
  resource: 'Resource',
}

const NODE_TYPE_COLORS: Record<NodeType, string> = {
  goal: 'bg-purple-100 text-purple-800',
  milestone: 'bg-blue-100 text-blue-800',
  task: 'bg-green-100 text-green-800',
  idea: 'bg-yellow-100 text-yellow-800',
  note: 'bg-gray-100 text-gray-700',
  resource: 'bg-orange-100 text-orange-800',
}

const STATUS_COLORS: Record<NodeStatus, string> = {
  pending: 'bg-gray-200 text-gray-700',
  in_progress: 'bg-blue-200 text-blue-800',
  completed: 'bg-green-200 text-green-800',
  blocked: 'bg-red-200 text-red-800',
  cancelled: 'bg-gray-300 text-gray-500 line-through',
}

const STATUS_LABELS: Record<NodeStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Done',
  blocked: 'Blocked',
  cancelled: 'Cancelled',
}

interface NodeCardProps {
  data: NodeCardData
}

export function NodeCard({ data }: NodeCardProps) {
  const { node, childProgress, tags, isLocked, unlocksCount, hasWarning } = data

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: node.id,
      data: { node, isLocked },
      disabled: node.status === 'cancelled',
    })

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined

  const hasChildren = childProgress.total > 0
  const progressPct = hasChildren
    ? Math.round((childProgress.completed / childProgress.total) * 100)
    : 0

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`
        rounded-lg border bg-white p-3 shadow-sm transition-shadow
        select-none cursor-grab
        ${isDragging ? 'opacity-70 shadow-lg ring-2 ring-blue-400' : 'hover:shadow-md'}
        ${isLocked ? 'border-l-4 border-l-amber-400' : 'border-gray-200'}
      `}
    >
      {/* Top row: type badge + score + icons */}
      <div className="mb-1.5 flex items-center justify-between gap-1">
        <span
          className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none ${NODE_TYPE_COLORS[node.node_type]}`}
        >
          {NODE_TYPE_LABELS[node.node_type]}
        </span>

        <div className="flex items-center gap-1">
          {hasWarning && (
            <span className="text-amber-500" title="Overdue or at risk">
              ⚠
            </span>
          )}
          {isLocked && (
            <span className="text-amber-600" title="Blocked by dependencies">
              🔒
            </span>
          )}
          <span
            className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700"
            title="Priority score"
          >
            {node.score}
          </span>
        </div>
      </div>

      {/* Title */}
      <h3 className="mb-1 text-sm font-medium leading-tight text-gray-900 line-clamp-2">
        {node.label}
      </h3>

      {/* Status badge */}
      <div className="mb-1.5">
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium leading-none ${STATUS_COLORS[node.status]}`}
        >
          {STATUS_LABELS[node.status]}
        </span>
      </div>

      {/* Child progress bar */}
      {hasChildren && (
        <div className="mb-1.5">
          <div className="flex items-center justify-between text-[10px] text-gray-500">
            <span>
              {childProgress.completed}/{childProgress.total} children
            </span>
            <span>{progressPct}%</span>
          </div>
          <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-green-500 transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div className="mb-1 flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Unlocks badge */}
      {unlocksCount > 0 && (
        <div className="mt-1 text-[10px] text-gray-500">
          Unlocks{' '}
          <span className="font-semibold text-indigo-600">{unlocksCount}</span>
        </div>
      )}

      {/* Blitz indicator */}
      {node.in_blitz && (
        <div className="mt-1 inline-block rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700">
          ⚡ Blitz {node.blitz_multiplier}×
        </div>
      )}
    </div>
  )
}
