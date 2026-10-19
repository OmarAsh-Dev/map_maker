import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'

const root = document.getElementById('root') as HTMLElement

// Dev-only chunk-renderer self-test harness: run `npm run dev` and open the
// window with ?selftest=chunks. The dynamic import is dead-code-eliminated in
// production builds (import.meta.env.DEV is statically false there).
if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('selftest') === 'chunks') {
  void import('./dev/chunkSelfTest').then(({ mountChunkSelfTest }) => {
    mountChunkSelfTest(root)
  })
} else {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}
