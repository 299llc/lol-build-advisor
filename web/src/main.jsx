import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import Privacy from './Privacy.jsx'

const BASE = '/lolsupkun'

function getPage() {
  const path = window.location.pathname.replace(BASE, '').replace(/\/+$/, '')
  return path || '/'
}

function Router() {
  const [page, setPage] = useState(getPage)

  useEffect(() => {
    const onPopState = () => setPage(getPage())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  if (page === '/privacy') return <Privacy />
  return <App />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Router />
  </StrictMode>,
)
