'use client'

import { useState, useMemo, useCallback } from 'react'
import type { Task, TaskStatus } from '@/types/operations'
import type { Project } from '@/types/operations'
import { TaskCard } from './TaskCard'
import { getStatusConfig } from '@/config/operations'
import { OPERATIONS_CONFIG } from '@/config/operations'
import {
  BoardFilterBar,
  applyBoardFilters,
  DEFAULT_BOARD_FILTERS,
  type BoardFilterState,
} from './BoardFilterBar'
import {
  BlitzSelector,
  isBlitzAligned,
  blitzCardClass,
  DEFAULT_BLITZ,
  type BlitzState,
} from './BlitzSelector'

const BOARD_STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'WAITING', 'DONE']

interface TaskBoardWithFiltersProps {
  tasks: Array<Task & { project?: { id: string; title: string } | null }>
  projects?: Project[]
  onTaskClick?: (task: Task) => void
  onTaskDelete?: (taskId: string) => void
  onTaskPeek?: (taskId: string) => void
  showDone?: boolean
}

export function TaskBoardWithFilters({
  tasks,
  projects = [],
  onTaskClick,
  onTaskDelete,
  onTaskPeek,
  showDone = true,
}: TaskBoardWithFiltersProps) {
  const [filters, setFilters] = useState<BoardFilterState>(DEFAULT_BOARD_FILTERS)
  const [blitz, setBlitz] = useState<BlitzState>(DEFAULT_BLITZ)

  // Collect available labels from all tasks
  const availableLabels = useMemo(() => {
    const labelSet = new Set<string>()
    for (const task of tasks) {
      if (task.tags) {
        for (const tag of task.tags) {
          labelSet.add(tag)
        }
      }
    }
    return Array.from(labelSet).sort()
  }, [tasks])

  // Apply filters
  const filteredTasks = useMemo(
    () => applyBoardFilters(tasks, filters),
    [tasks, filters]
  )

  // Group by status
  const tasksByStatus = useMemo(() => {
    return filteredTasks.reduce(
      (acc, task) => {
        const status = task.status || 'TODO'
        if (!acc[status]) acc[status] = []
        acc[status].push(task)
        return acc
      },
      {} as Record<TaskStatus, typeof filteredTasks>
    )
  }, [filteredTasks])

  const statuses = showDone
    ? BOARD_STATUSES
    : BOARD_STATUSES.filter((s) => s !== 'DONE')

  const isBlitzActive = blitz.mode !== 'off'

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <BoardFilterBar
        filters={filters}
        onFiltersChange={setFilters}
        projects={projects}
        availableLabels={availableLabels}
        taskCount={tasks.length}
        filteredCount={filteredTasks.length}
      />

      {/* Blitz selector */}
      <div className="relative">
        <BlitzSelector
          blitz={blitz}
          onBlitzChange={setBlitz}
          pillars={[...OPERATIONS_CONFIG.pillars]}
        />
      </div>

      {/* Board columns */}
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(${statuses.length}, minmax(250px, 1fr))` }}
      >
        {statuses.map((status) => {
          const config = getStatusConfig(status)
          const statusTasks = tasksByStatus[status] || []

          return (
            <div key={status} className="space-y-3">
              {/* Column Header */}
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: config?.color || '#6B7280' }}
                  />
                  <h3 className="text-sm font-medium text-text-secondary">
                    {config?.label || status}
                  </h3>
                </div>
                <span className="text-xs text-text-tertiary bg-white/5 px-1.5 py-0.5 rounded">
                  {statusTasks.length}
                </span>
              </div>

              {/* Column Content */}
              <div className="space-y-2 min-h-[200px] p-2 rounded-lg bg-white/[0.02] border border-white/5">
                {statusTasks.length > 0 ? (
                  statusTasks.map((task) => {
                    const aligned = isBlitzAligned(task, blitz)
                    return (
                      <div
                        key={task.id}
                        className={`rounded-lg transition-all duration-200 ${
                          isBlitzActive ? blitzCardClass(aligned) : ''
                        }`}
                      >
                        <TaskCard
                          task={task}
                          compact
                          showUrgency={false}
                          onClick={onTaskClick ? () => onTaskClick(task) : undefined}
                          onDelete={onTaskDelete}
                          onPeek={onTaskPeek}
                        />
                      </div>
                    )
                  })
                ) : (
                  <div className="flex items-center justify-center h-24 text-xs text-text-tertiary">
                    No tasks
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
