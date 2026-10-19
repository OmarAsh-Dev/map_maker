// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import App from './App'

vi.mock('maplibre-gl', () => ({
  Map: class {
    on() {
      return this
    }
    remove() {}
  },
  setWorkerUrl: () => {}
}))

beforeEach(() => {
  ;(window as unknown as { api: unknown }).api = {
    listPresets: async () => [],
    onExportProgress: () => () => {}
  }
})

it('renders the map_maker title', () => {
  render(<App />)
  expect(screen.getByText('map_maker')).toBeInTheDocument()
})
