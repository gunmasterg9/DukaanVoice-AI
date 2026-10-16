import { useEffect, useState } from 'react'
import { healthIndicatorState } from './healthState'
import { api } from './services/api'
import { Products } from './components/Products'
import { QuickSale } from './components/QuickSale'
import { UdhaarKhata } from './components/UdhaarKhata'
import { Transactions } from './components/Transactions'
import { Reports } from './components/Reports'
import { CommandBar } from './components/CommandBar'
import { LanguageSelector } from './i18n/LanguageSelector'
import { useI18n } from './i18n/I18nContext'
import './index.css'

function App() {
  const { t } = useI18n()
  const [activePage, setActivePage] = useState('quick_sale')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  const pages = [
    { id: 'quick_sale', label: `⚡ ${t('nav.quick_sale')}` },
    { id: 'dashboard', label: t('nav.dashboard') },
    { id: 'products', label: t('nav.products') },
    { id: 'transactions', label: t('nav.transactions') },
    { id: 'udhaar_khata', label: `📒 ${t('nav.udhaar_khata')}` },
    { id: 'reports', label: t('nav.reports') },
  ]

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
            <h1>{t('app.title')}</h1>
            <div className="app-logo-tagline">{t('app.tagline')}</div>
          </div>
        </div>

        <div className="app-header-controls">
          <nav className="app-nav" aria-label="Main Navigation">
            {pages.map((page) => (
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
          <LanguageSelector />
        </div>
      </header>

      {/* Multilingual Natural Command & Voice Bar */}
      <div className="command-bar-section">
        <CommandBar onNavigate={setActivePage} />
      </div>

      <main className="app-main">
        {activePage === 'dashboard' && (
          <div className="dashboard">
            <div className="welcome-section">
              <h2>{t('dashboard.welcome_title')}</h2>
              <p>{t('dashboard.welcome_desc')}</p>
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
                  <h3>{t('dashboard.api_health')}</h3>
                  <p>{health.detail}</p>
                  <span className={`badge badge-${health.tone}`}>{health.label}</span>
                  {health.status === 'error' && (
                    <button type="button" className="btn btn-outline retry" onClick={loadHealth}>
                      {t('dashboard.try_again')}
                    </button>
                  )}
                </div>
              </div>

              <div className="status-card">
                <div className="status-icon database">⌂</div>
                <div className="status-info">
                  <h3>{t('dashboard.sqlite_register')}</h3>
                  <p>{t('dashboard.sqlite_desc')}</p>
                  <span className="badge badge-success">{t('dashboard.active')}</span>
                </div>
              </div>

              <div className="status-card">
                <div className="status-icon phase">4</div>
                <div className="status-info">
                  <h3>{t('dashboard.current_phase')}</h3>
                  <p>{t('dashboard.current_phase_desc')}</p>
                  <span className="badge badge-info">22 languages</span>
                </div>
              </div>
            </div>

            {/* Quick Link Cards */}
            <div className="status-grid" style={{ marginTop: 'var(--space-md)' }}>
              <div className="card quick-actions-card">
                <div className="card-header">
                  <h3 className="card-title">{t('dashboard.card_products_title')}</h3>
                </div>
                <p className="placeholder-copy">{t('dashboard.card_products_desc')}</p>
                <div style={{ marginTop: 'var(--space-md)' }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setActivePage('products')}
                  >
                    {t('dashboard.card_products_action')}
                  </button>
                </div>
              </div>

              <div className="card quick-actions-card">
                <div className="card-header">
                  <h3 className="card-title">{t('dashboard.card_trans_title')}</h3>
                </div>
                <p className="placeholder-copy">{t('dashboard.card_trans_desc')}</p>
                <div style={{ marginTop: 'var(--space-md)' }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setActivePage('transactions')}
                  >
                    {t('dashboard.card_trans_action')}
                  </button>
                </div>
              </div>

              <div className="card quick-actions-card">
                <div className="card-header">
                  <h3 className="card-title">{t('dashboard.card_reports_title')}</h3>
                </div>
                <p className="placeholder-copy">{t('dashboard.card_reports_desc')}</p>
                <div style={{ marginTop: 'var(--space-md)' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setActivePage('reports')}
                  >
                    {t('dashboard.card_reports_action')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activePage === 'quick_sale' && <QuickSale />}
        {activePage === 'products' && <Products />}
        {activePage === 'transactions' && <Transactions />}
        {activePage === 'udhaar_khata' && <UdhaarKhata />}
        {activePage === 'reports' && <Reports />}
      </main>
    </div>
  )
}

export default App
