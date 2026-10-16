import { useEffect, useState } from 'react'
import { healthIndicatorState } from './healthState'
import { api } from './services/api'
import { Products } from './components/Products'
import { Transactions } from './components/Transactions'
import { Reports } from './components/Reports'
import './index.css'

const PAGES = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'products', label: 'Products' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'reports', label: 'Reports' },
]

function App() {
  const [activePage, setActivePage] = useState('dashboard')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  function loadHealth() {
    setLoading(true)
    setError(null)
    api
      .health()
      .then((payload) => {
        setData(payload)
        setError(null)
      })
      .catch((err) => {
        setData(null)
        setError(err.message || 'Unable to reach the API')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let ignore = false
    api
      .health()
      .then((payload) => {
        if (!ignore) {
          setData(payload)
          setError(null)
        }
      })
      .catch((err) => {
        if (!ignore) {
          setData(null)
          setError(err.message || 'Unable to reach the API')
        }
      })
      .finally(() => {
        if (!ignore) {
          setLoading(false)
        }
      })
    return () => {
      ignore = true
    }
  }, [])

  const health = healthIndicatorState({ loading, error, data })

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-logo">
          <div className="app-logo-icon" aria-hidden="true">
            द
          </div>
          <div>
            <h1>DukaanVoice AI</h1>
            <div className="app-logo-tagline">Gujarati-first shop register</div>
          </div>
        </div>
        <nav className="app-nav" aria-label="Main">
          {PAGES.map((page) => (
            <button
              key={page.id}
              type="button"
              className={activePage === page.id ? 'active' : ''}
              onClick={() => setActivePage(page.id)}
            >
              {page.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="app-main">
        {activePage === 'dashboard' && (
          <div className="dashboard">
            <div className="welcome-section">
              <h2>Business Reports &amp; Reconciliation Active</h2>
              <p>
                Phase 4 provides daily sales analytics, purchase expenditure breakdown,
                product sales totals, inventory valuation, and mathematical ledger reconciliation.
                Voice and AI interpretation remain in later phases.
              </p>
            </div>

            <div className="status-grid">
              <div className={`status-card tone-${health.tone}`}>
                <div className="status-icon backend">
                  {health.status === 'loading' ? (
                    <div className="spinner" aria-hidden="true" />
                  ) : health.status === 'success' ? (
                    '●'
                  ) : (
                    '!'
                  )}
                </div>
                <div className="status-info">
                  <h3>API health</h3>
                  <p>{health.detail}</p>
                  <span className={`badge badge-${health.tone}`}>{health.label}</span>
                  {health.status === 'error' && (
                    <button type="button" className="btn btn-outline retry" onClick={loadHealth}>
                      Try again
                    </button>
                  )}
                </div>
              </div>

              <div className="status-card">
                <div className="status-icon database">⌂</div>
                <div className="status-info">
                  <h3>SQLite register</h3>
                  <p>Catalog, inventory ledger, and transactions active.</p>
                  <span className="badge badge-success">active</span>
                </div>
              </div>

              <div className="status-card">
                <div className="status-icon phase">4</div>
                <div className="status-info">
                  <h3>Current phase</h3>
                  <p>Reports &amp; reconciliation active. Voice/AI deferred.</p>
                  <span className="badge badge-info">phase 4</span>
                </div>
              </div>
            </div>

            {/* Quick Link Cards */}
            <div className="status-grid" style={{ marginTop: 'var(--space-md)' }}>
              <div className="card quick-actions-card">
                <div className="card-header">
                  <h3 className="card-title">Product Register</h3>
                </div>
                <p className="placeholder-copy">
                  Manage shop items, standard inventory units, purchase/selling prices, and unit conversions.
                </p>
                <div style={{ marginTop: 'var(--space-md)' }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setActivePage('products')}
                  >
                    Open Products →
                  </button>
                </div>
              </div>

              <div className="card quick-actions-card">
                <div className="card-header">
                  <h3 className="card-title">Transaction Ledger</h3>
                </div>
                <p className="placeholder-copy">
                  Record sales drafts, verify order totals, confirm atomic stock deductions, and track purchases.
                </p>
                <div style={{ marginTop: 'var(--space-md)' }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setActivePage('transactions')}
                  >
                    Open Transactions →
                  </button>
                </div>
              </div>

              <div className="card quick-actions-card">
                <div className="card-header">
                  <h3 className="card-title">Reports &amp; Audit</h3>
                </div>
                <p className="placeholder-copy">
                  View daily sales revenue, purchase ledger, inventory stock valuation, and stock reconciliation.
                </p>
                <div style={{ marginTop: 'var(--space-md)' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setActivePage('reports')}
                  >
                    Open Reports →
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activePage === 'products' && <Products />}
        {activePage === 'transactions' && <Transactions />}
        {activePage === 'reports' && <Reports />}
      </main>
    </div>
  )
}

export default App
