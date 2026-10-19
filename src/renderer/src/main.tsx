import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'

const root = document.getElementById('root') as HTMLElement

// Dev-only self-test harnesses: run `npm run dev` and open the window with
// ?selftest=chunks or ?selftest=export. The dynamic imports are
// dead-code-eliminated in production builds (import.meta.env.DEV is
// statically false there).
const selftest = new URLSearchParams(window.location.search).get('selftest')
if (import.meta.env.DEV && selftest === 'chunks') {
  void import('./dev/chunkSelfTest').then(({ mountChunkSelfTest }) => {
    mountChunkSelfTest(root)
  })
} else if (import.meta.env.DEV && selftest === 'export') {
  void import('./dev/exportSelfTest').then(({ mountExportSelfTest }) => {
    mountExportSelfTest(root)
  })
} else {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}
