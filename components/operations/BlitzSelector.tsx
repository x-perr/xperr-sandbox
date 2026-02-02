'use client'

import { useState, useMemo } from 'react'
import { Zap, Clock, Target, Flame, X } from 'lucide-react'

/**
 * Blitz modes define how tasks are highlighted on the kanban board.
 * Each mode applies a visual highlight to "aligned" cards and dims others.
 */
export type BlitzMode =
  | 'off'
  | 'quick-wins'    // Low effort, high urgency
  | 'deep-focus'    // High effort, single-pillar tasks
  | 'pillar-sprint' // All tasks in a selected pillar
  | 'overdue'       // Overdue or due today

export interface BlitzState {
  mode: BlitzMode
  pillar?: string   // For pillar-sprint mode
}

export const DEFAULT_BLITZ: BlitzState = { mode: 'off' }

interface BlitzSelectorProps {
  blitz: BlitzState
  onBlitzChange: (blitz: BlitzState) => void
  pillars?: Array<{ id: string; label: string; color: string }>
}

const BLITZ_MODES = [
  {
    id: 'quick-wins' as const,
    label: 'Quick Wins',
    description: 'Low effort, actionable now',
    icon: Zap,
    color: '#F59E0B',
  },
  {
    id: 'deep-focus' as const,
    label: 'Deep Focus',
    description: 'Heavy tasks needing concentration',
    icon: Target,
    color: '#8B5CF6',
  },
  {
    id: 'overdue' as const,
    label: 'Overdue',
    description: 'Past due or due today',
    icon: Flame,
    color: '#EF4444',
  },
  {
    id: 'pillar-sprint' as const,
    label: 'Pillar Sprint',
    description: 'Focus on one life domain',
    icon: Clock,
    color: '#3B82F6',
  },
] as const

export function BlitzSelector({ blitz, onBlitzChange, pillars = [] }: BlitzSelectorProps) {
  const [showPillarPicker, setShowPillarPicker] = useState(false)

  const activeMode = BLITZ_MODES.find((m) => m.id === blitz.mode)

  const handleModeSelect = (mode: BlitzMode) => {
    if (mode === blitz.mode) {
      onBlitzChange(DEFAULT_BLITZ)
      return
    }
    if (mode === 'pillar-sprint') {
      setShowPillarPicker(true)
      return
    }
    onBlitzChange({ mode })
  }

  const handlePillarSelect = (pillarId: string) => {
    onBlitzChange({ mode: 'pillar-sprint', pillar: pillarId })
    setShowPillarPicker(false)
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        <Zap className="w-3.5 h-3.5 text-text-tertiary" />
        <span className="text-xs text-text-tertiary font-medium">Blitz</span>
      </div>

      <div className="flex items-center gap-1">
        {BLITZ_MODES.map((mode) => {
          const Icon = mode.icon
          const isActive = blitz.mode === mode.id
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => handleModeSelect(mode.id)}
              title={mode.description}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md border transition-all ${
                isActive
                  ? 'border-transparent text-white shadow-sm'
                  : 'border-white/10 text-text-secondary hover:text-text-primary hover:bg-white/5'
              }`}
              style={isActive ? { backgroundColor: mode.color } : undefined}
            >
              <Icon className="w-3 h-3" />
              {mode.label}
              {isActive && mode.id === 'pillar-sprint' && blitz.pillar && (
                <span className="ml-0.5 opacity-80">
                  ({pillars.find((p) => p.id === blitz.pillar)?.label ?? blitz.pillar})
                </span>
              )}
            </button>
          )
        })}

        {blitz.mode !== 'off' && (
          <button
            type="button"
            onClick={() => onBlitzChange(DEFAULT_BLITZ)}
            className="p-1 text-text-tertiary hover:text-text-primary transition-colors"
            title="Clear blitz mode"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Pillar picker dropdown */}
      {showPillarPicker && (
        <div className="absolute mt-1 top-full bg-surface border border-white/10 rounded-lg shadow-lg z-20 p-2">
          <p className="text-[10px] text-text-tertiary mb-1 px-1">Select pillar</p>
          {pillars.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handlePillarSelect(p.id)}
              className="flex items-center gap-2 w-full px-2 py-1 text-xs rounded text-text-secondary hover:bg-white/5 text-left"
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: p.color }}
              />
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowPillarPicker(false)}
            className="w-full mt-1 px-2 py-1 text-[10px] text-text-tertiary hover:text-text-primary text-center"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Determine if a task is "aligned" (highlighted) for the current blitz mode.
 * Returns true if the task should be highlighted, false if dimmed.
 */
export function isBlitzAligned(
  task: {
    priority: string
    status: string
    pillar?: string | null
    effortEstimate?: number | null
    dueDate?: Date | string | null
  },
  blitz: BlitzState
): boolean {
  if (blitz.mode === 'off') return true

  switch (blitz.mode) {
    case 'quick-wins': {
      const effort = task.effortEstimate ?? 2
      const isHighPriority = ['P0', 'P1'].includes(task.priority)
      return effort <= 2 || (effort <= 3 && isHighPriority)
    }

    case 'deep-focus': {
      const effort = task.effortEstimate ?? 2
      return effort >= 4
    }

    case 'overdue': {
      if (!task.dueDate) return false
      const due = typeof task.dueDate === 'string' ? new Date(task.dueDate) : task.dueDate
      const now = new Date()
      now.setHours(23, 59, 59, 999)
      return due <= now
    }

    case 'pillar-sprint': {
      if (!blitz.pillar) return true
      return task.pillar === blitz.pillar
    }

    default:
      return true
  }
}

/**
 * CSS class helper: returns opacity/style class for a card based on blitz alignment.
 * Use this to conditionally style TaskCard wrappers.
 */
export function blitzCardClass(aligned: boolean): string {
  return aligned
    ? 'ring-1 ring-accent/40 shadow-sm'
    : 'opacity-40 saturate-50'
}
