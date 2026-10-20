import { useMapStore } from '../../stores/mapStore'

export default function LabelsToggle() {
  const labelsHidden = useMapStore((state) => state.labelsHidden)
  return (
    <label className="flex cursor-pointer items-center justify-between border-b border-gray-200 px-3 py-2 text-sm font-medium text-gray-800">
      <span>Labels</span>
      <input
        type="checkbox"
        aria-label="Show labels"
        checked={!labelsHidden}
        onChange={(event) => useMapStore.getState().setLabelsHidden(!event.target.checked)}
      />
    </label>
  )
}
