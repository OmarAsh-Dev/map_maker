import type { ReactNode } from 'react'
import type { StyleSpecification } from 'maplibre-gl'
import { CATEGORY_GROUPS } from '../../lib/categories'
import { readCategory } from '../../lib/styleMap'
import type { LayerMap, Val } from '../../lib/styleMap'
import { useMapStore } from '../../stores/mapStore'

const MIXED_LABEL = 'Mixed'
const NEUTRAL_COLOR = '#ffffff'
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i

function categoryLabelOf(id: string): string {
  for (const group of CATEGORY_GROUPS) {
    if (group.id === id) return group.label
    for (const child of group.children) {
      if (child.id === id) return child.label
    }
  }
  return id
}

function hexColorOf(value: Val<string>): string | null {
  return typeof value === 'string' && HEX_COLOR_PATTERN.test(value) ? value : null
}

function percentOf(value: Val<number>): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 100) : null
}

interface LooseLayer {
  id: string
  layout?: Record<string, unknown>
  paint?: Record<string, unknown>
}

function labelIconsRenderedOf(style: StyleSpecification, layerMap: LayerMap, categoryId: string): boolean {
  const entry = layerMap[categoryId]
  if (!entry) return true
  const labelIds = new Set(entry.labels)
  let sawLabelLayer = false
  for (const layer of ((style as { layers?: LooseLayer[] }).layers ?? [])) {
    if (!labelIds.has(layer.id)) continue
    sawLabelLayer = true
    if (layer.layout?.visibility === 'none') continue
    if (layer.paint?.['icon-opacity'] !== 0) return true
  }
  return !sawLabelLayer
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

interface SectionProps {
  title: string
  eyeLabel: string
  visible: boolean
  onToggle: () => void
  children: ReactNode
}

function Section({ title, eyeLabel, visible, onToggle, children }: SectionProps) {
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
        <button
          type="button"
          aria-label={eyeLabel}
          aria-pressed={!visible}
          className="rounded p-1 text-gray-500 hover:bg-gray-200 hover:text-gray-900"
          onClick={onToggle}
        >
          <EyeIcon visible={visible} />
        </button>
      </div>
      <div className="mt-2 space-y-2">{children}</div>
    </div>
  )
}

interface ColorFieldProps {
  label: string
  inputLabel: string
  testId: string
  value: Val<string>
  onChange: (value: string) => void
}

function ColorField({ label, inputLabel, testId, value, onChange }: ColorFieldProps) {
  const hex = hexColorOf(value)
  const mixed = hex === null
  return (
    <div data-testid={testId} className="flex items-center justify-between gap-2">
      <span className="text-sm text-gray-700">{label}</span>
      <div className="flex items-center gap-2">
        {mixed && <span className="text-xs text-gray-400">{MIXED_LABEL}</span>}
        <input
          type="color"
          aria-label={inputLabel}
          value={mixed ? NEUTRAL_COLOR : hex}
          onChange={(event) => onChange(event.target.value)}
          className="h-6 w-9 cursor-pointer rounded border border-gray-300 bg-white p-0.5"
        />
      </div>
    </div>
  )
}

interface OpacityFieldProps {
  label: string
  inputLabel: string
  testId: string
  value: Val<number>
  onChange: (value: number) => void
}

function OpacityField({ label, inputLabel, testId, value, onChange }: OpacityFieldProps) {
  const percent = percentOf(value)
  const mixed = percent === null
  return (
    <div data-testid={testId} className="flex items-center justify-between gap-2">
      <span className="text-sm text-gray-700">{label}</span>
      <div className="flex items-center gap-2">
        {mixed ? (
          <span className="text-xs text-gray-400">{MIXED_LABEL}</span>
        ) : (
          <span className="w-8 text-right text-xs tabular-nums text-gray-500">{percent}%</span>
        )}
        <input
          type="range"
          aria-label={inputLabel}
          min={0}
          max={100}
          step={1}
          value={mixed ? 100 : percent}
          onChange={(event) => onChange(Number(event.target.value) / 100)}
          className="w-24 accent-slate-700"
        />
      </div>
    </div>
  )
}

export default function CategoryDetailPanel() {
  const selectedId = useMapStore((state) => state.selectedCategoryId)
  const style = useMapStore((state) => state.style)
  const layerMap = useMapStore((state) => state.layerMap)
  const patchCategory = useMapStore((state) => state.patchCategory)

  if (selectedId === null || !style) return null

  const state = readCategory(style, layerMap, selectedId)
  const labelIconsVisible = labelIconsRenderedOf(style, layerMap, selectedId)

  const toggleGeometryVisible = () => {
    const current = useMapStore.getState()
    if (!current.style || selectedId === null) return
    const nowVisible = readCategory(current.style, current.layerMap, selectedId).geometryVisible
    current.patchCategory(selectedId, { geometryVisible: !nowVisible })
  }

  const toggleLabelVisible = () => {
    const current = useMapStore.getState()
    if (!current.style || selectedId === null) return
    const nowVisible = readCategory(current.style, current.layerMap, selectedId).labelVisible
    current.patchCategory(selectedId, { labelVisible: !nowVisible })
  }

  const toggleLabelIconVisible = () => {
    const current = useMapStore.getState()
    if (!current.style || selectedId === null) return
    const nowVisible = labelIconsRenderedOf(current.style, current.layerMap, selectedId)
    current.patchCategory(selectedId, { labelIconVisible: !nowVisible })
  }

  return (
    <section
      data-testid="category-detail-panel"
      aria-label="Category details"
      className="border-t border-gray-200 bg-white px-3 pb-4 pt-2"
    >
      <h2 className="text-sm font-semibold text-gray-900">{categoryLabelOf(selectedId)}</h2>

      <Section
        title="Geometry"
        eyeLabel="Toggle Geometry visibility"
        visible={state.geometryVisible}
        onToggle={toggleGeometryVisible}
      >
        <ColorField
          label="Fill"
          inputLabel="Geometry fill"
          testId="field-geometry-fill"
          value={state.geometryFill}
          onChange={(value) => patchCategory(selectedId, { geometryFill: value })}
        />
        <ColorField
          label="Stroke"
          inputLabel="Geometry stroke"
          testId="field-geometry-stroke"
          value={state.geometryStroke}
          onChange={(value) => patchCategory(selectedId, { geometryStroke: value })}
        />
        <OpacityField
          label="Opacity"
          inputLabel="Geometry opacity"
          testId="field-geometry-opacity"
          value={state.geometryOpacity}
          onChange={(value) => patchCategory(selectedId, { geometryOpacity: value })}
        />
      </Section>

      <Section
        title="Label text"
        eyeLabel="Toggle Label text visibility"
        visible={state.labelVisible}
        onToggle={toggleLabelVisible}
      >
        <ColorField
          label="Fill"
          inputLabel="Label text fill"
          testId="field-label-text-fill"
          value={state.labelFill}
          onChange={(value) => patchCategory(selectedId, { labelFill: value })}
        />
        <ColorField
          label="Stroke"
          inputLabel="Label text stroke"
          testId="field-label-text-stroke"
          value={state.labelStroke}
          onChange={(value) => patchCategory(selectedId, { labelStroke: value })}
        />
        <OpacityField
          label="Opacity"
          inputLabel="Label text opacity"
          testId="field-label-text-opacity"
          value={state.labelOpacity}
          onChange={(value) => patchCategory(selectedId, { labelOpacity: value })}
        />
      </Section>

      <Section
        title="Label icon"
        eyeLabel="Toggle Label icon visibility"
        visible={labelIconsVisible}
        onToggle={toggleLabelIconVisible}
      >
        <ColorField
          label="Color"
          inputLabel="Label icon color"
          testId="field-label-icon-color"
          value={state.labelIconColor}
          onChange={(value) => patchCategory(selectedId, { labelIconColor: value })}
        />
      </Section>
    </section>
  )
}
