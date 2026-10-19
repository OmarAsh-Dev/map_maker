import type { StyleSpecification } from 'maplibre-gl'
import { create } from 'zustand'
import type { StoreApi, UseBoundStore } from 'zustand'
import { applyCategoryPatch } from '../lib/styleMap'
import type { CategoryPatch, LayerMap } from '../lib/styleMap'

export const DEFAULT_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

export interface MapStore {
  style: StyleSpecification | null
  layerMap: LayerMap
  basemapUrl: string
  selectedCategoryId: string | null
  styleLoaded(style: StyleSpecification, layerMap: LayerMap): void
  selectCategory(id: string | null): void
  patchCategory(categoryId: string, patch: CategoryPatch): void
  setBasemap(url: string, layerMap: LayerMap): void
}

export const useMapStore: UseBoundStore<StoreApi<MapStore>> = create<MapStore>()((set, get) => ({
  style: null,
  layerMap: {},
  basemapUrl: DEFAULT_STYLE_URL,
  selectedCategoryId: null,
  styleLoaded: (style, layerMap) => set({ style, layerMap }),
  selectCategory: (id) => set({ selectedCategoryId: id }),
  patchCategory: (categoryId, patch) => {
    const { style, layerMap } = get()
    if (!style) return
    set({ style: applyCategoryPatch(style, layerMap, categoryId, patch) })
  },
  setBasemap: (url, layerMap) => set({ basemapUrl: url, layerMap, style: null }),
}))
