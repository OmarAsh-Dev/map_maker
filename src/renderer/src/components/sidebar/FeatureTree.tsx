import { useState } from 'react'
import type { MouseEvent } from 'react'
import type { CategoryDef, CategoryGroupDef } from '../../lib/categories'
import { CATEGORY_GROUPS } from '../../lib/categories'
import { readCategory } from '../../lib/styleMap'
import type { CategoryState } from '../../lib/styleMap'
import { useMapStore } from '../../stores/mapStore'

const MIXED_SWATCH_COLOR = '#94a3b8'

function swatchColorOf(state: CategoryState | null): string {
  if (!state || state.geometryFill === 'mixed') return MIXED_SWATCH_COLOR
  return typeof state.geometryFill === 'string' ? state.geometryFill : MIXED_SWATCH_COLOR
}

function EyeIcon({ visible }: { visible: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.75" />
      {!visible && <line x1="4" y1="4" x2="20" y2="20" />}
    </svg>
  )
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform${expanded ? ' rotate-90' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 4l4 4-4 4" />
    </svg>
  )
}

interface CategoryRowProps {
  id: string
  label: string
  depth: number
  expandable: boolean
  expanded: boolean
  onToggleExpanded: () => void
}

function CategoryRow({ id, label, depth, expandable, expanded, onToggleExpanded }: CategoryRowProps) {
  const style = useMapStore((state) => state.style)
  const layerMap = useMapStore((state) => state.layerMap)
  const selected = useMapStore((state) => state.selectedCategoryId === id)
  const categoryState = style ? readCategory(style, layerMap, id) : null
  const visible = categoryState ? categoryState.visible : true

  const handleEyeClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    const current = useMapStore.getState()
    if (!current.style) return
    const nowVisible = readCategory(current.style, current.layerMap, id).visible
    current.patchCategory(id, { visible: !nowVisible })
  }

  const handleRowClick = () => {
    useMapStore.getState().selectCategory(id)
    if (expandable) onToggleExpanded()
  }

  return (
    <div
      className={`${depth === 0 ? 'pl-3' : 'pl-8'} flex h-8 cursor-pointer select-none items-center gap-2 pr-2 text-sm text-gray-900 ${
        selected ? 'bg-gray-100' : 'hover:bg-gray-100'
      } ${visible ? '' : 'opacity-50'}`}
      onClick={handleRowClick}
    >
      {expandable ? <ChevronIcon expanded={expanded} /> : <span className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      <span
        className="h-3.5 w-3.5 shrink-0 rounded-sm border border-black/10"
        style={{ backgroundColor: swatchColorOf(categoryState) }}
        data-testid={`swatch-${id}`}
        aria-hidden="true"
      />
      <span className="truncate">{label}</span>
      <span className="flex-1" />
      <button
        type="button"
        aria-label={`Toggle ${label} visibility`}
        aria-pressed={!visible}
        className="rounded p-1 text-gray-500 hover:bg-gray-200 hover:text-gray-900"
        onClick={handleEyeClick}
      >
        <EyeIcon visible={visible} />
      </button>
    </div>
  )
}

function FeatureGroupRow({ group }: { group: CategoryGroupDef }) {
  const [expanded, setExpanded] = useState(false)
  const hasChildren = group.children.length > 0
  return (
    <div>
      <CategoryRow
        id={group.id}
        label={group.label}
        depth={0}
        expandable={hasChildren}
        expanded={expanded}
        onToggleExpanded={() => setExpanded((value) => !value)}
      />
      {hasChildren && expanded
        ? group.children.map((child: CategoryDef) => (
            <CategoryRow
              key={child.id}
              id={child.id}
              label={child.label}
              depth={1}
              expandable={false}
              expanded={false}
              onToggleExpanded={() => {}}
            />
          ))
        : null}
    </div>
  )
}

export default function FeatureTree() {
  return (
    <nav aria-label="Map features" className="flex flex-col py-2">
      {CATEGORY_GROUPS.map((group) => (
        <FeatureGroupRow key={group.id} group={group} />
      ))}
    </nav>
  )
}
