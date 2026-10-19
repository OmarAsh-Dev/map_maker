// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'
import App from './App'

it('renders the map_maker title', () => {
  render(<App />)
  expect(screen.getByText('map_maker')).toBeInTheDocument()
})
