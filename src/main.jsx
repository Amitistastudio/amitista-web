import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import './index.css'
import App, { routeKeyFor } from './App.jsx'
import { preloadPage } from './lib/pageRegistry'
import { initialPath } from './lib/routePath'

const root = document.getElementById('root')

const tree = (
  <StrictMode>
    <App />
  </StrictMode>
)

function mount() {
  if (root.hasChildNodes()) {
    hydrateRoot(root, tree)
  } else {
    createRoot(root).render(tree)
  }
}

const path = initialPath()
const key = routeKeyFor(path)

const ready =
  key === 'docs'
    ? Promise.all([
        preloadPage(key),
        import('./content/docsBodies').then((bodies) => bodies.preloadDocBody(path.slice('/docs/'.length))),
      ])
    : preloadPage(key)

ready.then(mount, mount)
