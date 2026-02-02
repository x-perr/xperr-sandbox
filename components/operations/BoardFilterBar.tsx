'use client'

import { useState, useCallback, useMemo } from 'react'
import { Search, X, Filter, ChevronDown } from 'lucide-react'
import { OPERATIONS_CONFIG } from '@/config/operations'
import type { Project } from '@/types/operations'

export interface BoardFilterState {
  search: string
  priorities: string[]
  types: string[]
  pillars: string[]
  labels: string[]
  projectId: string | null
}

export const DEFAULT_BOARD_FILTERS: BoardFilterState = {
  search: '',
  priorities: [],
  types: [],
  pillars: [],
  labels: [],
  projectId: null,
}

interface BoardFilterBarProps {
  filters: BoardFilterState
  onFiltersChange: (filters: BoardFilterState) => void
  projects?: Project[]
  availableLabels?: string[]
  taskCount?: number
  filteredCount?: number
}

export function BoardFilterBar({
  filters,
  onFiltersChange,
  projects = [],
  availableLabels = [],
  taskCount = 0,
  filteredCount,
}: BoardFilterBarProps) {
  const [expandedSection, setExpandedSection] = useState<string | null>(null)

  const updateFilter = useCallback(
    <K extends keyof BoardFilterState>(key: K, value: BoardFilterState[K]) => {
      onFiltersChange({ ...filters, [key]: value })
    },
    [filters, onFiltersChange]
  )

  const toggleArrayFilter = useCallback(
    (key: 'priorities' | 'types' | 'pillars' | 'labels', value: string) => {
      const current = filters[key]
      const updated = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value]
      updateFilter(key, updated)
    },
    [filters, updateFilter]
  )

  const clearFilters = useCallback(() => {
    onFiltersChange(DEFAULT_BOARD_FILTERS)
  }, [onFiltersChange])

  const hasActiveFilters =
    filters.search !== '' ||
    filters.priorities.length > 0 ||
    filters.types.length > 0 ||
    filters.pillars.length > 0 ||
    filters.labels.length > 0 ||
    filters.projectId !== null

  const activeFilterCount =
    (filters.search ? 1 : 0) +
    filters.priorities.length +
    filters.types.length +
    filters.pillars.length +
    filters.labels.length +
    (filters.projectId ? 1 : 0)

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section)
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Compact filter row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Search */}
        <div className="relative flex-shrink-0 w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => updateFilter('search', e.target.value)}
            placeholder="Filter cards..."
            className="w-full pl-8 pr-7 py-1.5 bg-surface border border-white/10 rounded-md text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent/50 text-xs"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => updateFilter('search', '')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Priority chips */}
        <FilterDropdown
          label="Priority"
          isOpen={expandedSection === 'priority'}
          onToggle={() => toggleSection('priority')}
          activeCount={filters.priorities.length}
        >
          <div className="flex flex-col gap-1 p-2">
            {OPERATIONS_CONFIG.priorities.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => toggleArrayFilter('priorities', p.id)}
                className={`flex items-center gap-2 px-2 py-1 text-xs rounded transition-colors text-left ${
                  filters.priorities.includes(p.id)
                    ? 'bg-white/10 text-text-primary'
                    : 'text-text-secondary hover:bg-white/5'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: p.color }}
                />
                {p.label}
              </button>
            ))}
          </div>
        </FilterDropdown>

        {/* Type chips */}
        <FilterDropdown
          label="Type"
          isOpen={expandedSection === 'type'}
          onToggle={() => toggleSection('type')}
          activeCount={filters.types.length}
        >
          <div className="flex flex-col gap-1 p-2">
            {OPERATIONS_CONFIG.taskTypes.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleArrayFilter('types', t.id)}
                className={`flex items-center gap-2 px-2 py-1 text-xs rounded transition-colors text-left ${
                  filters.types.includes(t.id)
                    ? 'bg-white/10 text-text-primary'
                    : 'text-text-secondary hover:bg-white/5'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: t.color }}
                />
                {t.label}
              </button>
            ))}
          </div>
        </FilterDropdown>

        {/* Pillar chips */}
        <FilterDropdown
          label="Pillar"
          isOpen={expandedSection === 'pillar'}
          onToggle={() => toggleSection('pillar')}
          activeCount={filters.pillars.length}
        >
          <div className="flex flex-col gap-1 p-2">
            {OPERATIONS_CONFIG.pillars.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => toggleArrayFilter('pillars', p.id)}
                className={`flex items-center gap-2 px-2 py-1 text-xs rounded transition-colors text-left ${
                  filters.pillars.includes(p.id)
                    ? 'bg-white/10 text-text-primary'
                    : 'text-text-secondary hover:bg-white/5'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: p.color }}
                />
                {p.label}
              </button>
            ))}
          </div>
        </FilterDropdown>

        {/* Labels */}
        {availableLabels.length > 0 && (
          <FilterDropdown
            label="Labels"
            isOpen={expandedSection === 'labels'}
            onToggle={() => toggleSection('labels')}
            activeCount={filters.labels.length}
          >
            <div className="flex flex-col gap-1 p-2 max-h-48 overflow-y-auto">
              {availableLabels.map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleArrayFilter('labels', label)}
                  className={`px-2 py-1 text-xs rounded transition-colors text-left ${
                    filters.labels.includes(label)
                      ? 'bg-white/10 text-text-primary'
                      : 'text-text-secondary hover:bg-white/5'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </FilterDropdown>
        )}

        {/* Project filter */}
        {projects.length > 0 && (
          <FilterDropdown
            label="Project"
            isOpen={expandedSection === 'project'}
            onToggle={() => toggleSection('project')}
            activeCount={filters.projectId ? 1 : 0}
          >
            <div className="flex flex-col gap-1 p-2 max-h-48 overflow-y-auto">
              <button
                type="button"
                onClick={() => updateFilter('projectId', null)}
                className={`px-2 py-1 text-xs rounded transition-colors text-left ${
                  filters.projectId === null
                    ? 'bg-white/10 text-text-primary'
                    : 'text-text-secondary hover:bg-white/5'
                }`}
              >
                All Projects
              </button>
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => updateFilter('projectId', p.id)}
                  className={`px-2 py-1 text-xs rounded transition-colors text-left ${
                    filters.projectId === p.id
                      ? 'bg-white/10 text-text-primary'
                      : 'text-text-secondary hover:bg-white/5'
                  }`}
                >
                  {p.title}
                </button>
              ))}
            </div>
          </FilterDropdown>
        )}

        {/* Clear all */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="flex items-center gap-1 px-2 py-1.5 text-xs text-text-tertiary hover:text-text-primary transition-colors"
          >
            <X className="w-3 h-3" />
            Clear ({activeFilterCount})
          </button>
        )}

        {/* Count */}
        {filteredCount !== undefined && filteredCount !== taskCount && (
          <span className="text-xs text-text-tertiary ml-auto">
            {filteredCount}/{taskCount}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * Apply board filters to tasks
 */
export function applyBoardFilters<
  T extends {
    title: string
    description?: string | null
    priority: string
    status: string
    taskType?: string | null
    pillar?: string | null
    projectId?: string | null
    tags?: string[] | null
  }
>(tasks: T[], filters: BoardFilterState): T[] {
  return tasks.filter((task) => {
    if (filters.search) {
      const q = filters.search.toLowerCase()
      const titleMatch = task.title.toLowerCase().includes(q)
      const descMatch = task.description?.toLowerCase().includes(q)
      if (!titleMatch && !descMatch) return false
    }

    if (filters.priorities.length > 0 && !filters.priorities.includes(task.priority)) {
      return false
    }

    if (filters.types.length > 0 && (!task.taskType || !filters.types.includes(task.taskType))) {
      return false
    }

    if (filters.pillars.length > 0 && (!task.pillar || !filters.pillars.includes(task.pillar))) {
      return false
    }

    if (filters.labels.length > 0) {
      const taskTags = task.tags ?? []
      if (!filters.labels.some((label) => taskTags.includes(label))) return false
    }

    if (filters.projectId !== null && task.projectId !== filters.projectId) {
      return false
    }

    return true
  })
}

// --- Internal components ---

interface FilterDropdownProps {
  label: string
  isOpen: boolean
  onToggle: () => void
  activeCount: number
  children: React.ReactNode
}

function FilterDropdown({ label, isOpen, onToggle, activeCount, children }: FilterDropdownProps) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className={`flex items-center gap-1 px-2 py-1.5 text-xs rounded-md border transition-colors ${
          isOpen || activeCount > 0
            ? 'bg-accent/10 border-accent/30 text-accent'
            : 'bg-surface border-white/10 text-text-secondary hover:text-text-primary'
        }`}
      >
        {label}
        {activeCount > 0 && (
          <span className="px-1 py-0.5 text-[10px] rounded-full bg-accent text-white leading-none">
            {activeCount}
          </span>
        )}
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 min-w-[140px] bg-surface border border-white/10 rounded-lg shadow-lg z-20">
          {children}
        </div>
      )}
    </div>
  )
}
