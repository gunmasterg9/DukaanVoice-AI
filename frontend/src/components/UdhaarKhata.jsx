import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { useI18n } from '../i18n/I18nContext'
import { paiseToRupees, rupeesToPaise } from '../utils/formatters'

export function UdhaarKhata() {
  const { t } = useI18n()

  const [customers, setCustomers] = useState([])
  const [totalOutstanding, setTotalOutstanding] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [search, setSearch] = useState('')

  // Modals
  const [activeCustomer, setActiveCustomer] = useState(null) // for Ledger modal
  const [paymentCustomer, setPaymentCustomer] = useState(null) // for Record Payment modal
  const [addCustomerOpen, setAddCustomerOpen] = useState(false)

  // Payment form state
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMode, setPaymentMode] = useState('cash')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [submittingPayment, setSubmittingPayment] = useState(false)

  // Add customer form state
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    phone: '',
    address: '',
    credit_limit: '0.00',
  })
  const [submittingCustomer, setSubmittingCustomer] = useState(false)

  const [reloadTrigger, setReloadTrigger] = useState(0)
  const fetchCustomers = () => setReloadTrigger((prev) => prev + 1)

  useEffect(() => {
    let ignore = false
    const timer = setTimeout(() => {
      setLoading(true)
      api
        .getCustomers({ query: search.trim(), active: true, limit: 100 })
        .then((res) => {
          if (!ignore) {
            setCustomers(res.items || [])
            setTotalOutstanding(res.total_outstanding || 0)
            setError(null)
          }
        })
        .catch((err) => {
          if (!ignore) {
            setError(err.message || 'Failed to load customers.')
          }
        })
        .finally(() => {
          if (!ignore) {
            setLoading(false)
          }
        })
    }, 250)

    return () => {
      ignore = true
      clearTimeout(timer)
    }
  }, [search, reloadTrigger])

  const openLedgerModal = (customer) => {
    api
      .getCustomer(customer.id)
      .then((detail) => {
        setActiveCustomer(detail)
      })
      .catch((err) => {
        setError(err.message || 'Failed to fetch ledger details.')
      })
  }

  const openPaymentModal = (customer) => {
    setPaymentCustomer(customer)
    setPaymentAmount('')
    setPaymentMode('cash')
    setPaymentNotes('')
  }

  const handleRecordPayment = async (e) => {
    e.preventDefault()
    if (!paymentCustomer) return
    const amountPaise = rupeesToPaise(paymentAmount)
    if (amountPaise <= 0) {
      setError('Payment amount must be greater than zero.')
      return
    }

    setSubmittingPayment(true)
    setError(null)
    try {
      await api.recordCustomerPayment(paymentCustomer.id, {
        amount: amountPaise,
        payment_mode: paymentMode,
        notes: paymentNotes.trim() || undefined,
      })
      setNotice(
        `Payment of ₹${paymentAmount} recorded for ${paymentCustomer.name}. Ledger balance updated.`
      )
      setPaymentCustomer(null)
      fetchCustomers()
    } catch (err) {
      setError(err.message || 'Failed to record payment.')
    } finally {
      setSubmittingPayment(false)
    }
  }

  const handleCreateCustomer = async (e) => {
    e.preventDefault()
    if (!newCustomer.name.trim()) return
    setSubmittingCustomer(true)
    setError(null)
    try {
      await api.createCustomer({
        name: newCustomer.name.trim(),
        phone: newCustomer.phone.trim(),
        address: newCustomer.address.trim(),
        credit_limit: rupeesToPaise(newCustomer.credit_limit || '0'),
      })
      setNotice(`Customer "${newCustomer.name}" added successfully.`)
      setAddCustomerOpen(false)
      setNewCustomer({ name: '', phone: '', address: '', credit_limit: '0.00' })
      fetchCustomers()
    } catch (err) {
      setError(err.message || 'Failed to create customer.')
    } finally {
      setSubmittingCustomer(false)
    }
  }

  return (
    <div className="udhaar-view">
      {/* Header */}
      <div className="udhaar-header">
        <div>
          <h2>📒 {t('udhaar.title')}</h2>
          <p className="udhaar-sub">{t('udhaar.subtitle')}</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setAddCustomerOpen(true)}
        >
          {t('udhaar.add_customer')}
        </button>
      </div>

      {notice && <div className="alert alert-success">{notice}</div>}
      {error && <div className="alert alert-danger">{error}</div>}

      {/* KPI Cards */}
      <div className="status-grid udhaar-metrics">
        <div className="status-card tone-warning">
          <div className="status-icon" style={{ background: 'var(--color-amber-soft)', color: 'var(--color-amber-primary)' }}>
            ₹
          </div>
          <div className="status-info">
            <h3>{t('udhaar.total_outstanding')}</h3>
            <p className="udhaar-stat-val">₹{paiseToRupees(totalOutstanding)}</p>
            <span className="badge badge-warning">Active Khata</span>
          </div>
        </div>

        <div className="status-card tone-info">
          <div className="status-icon" style={{ background: 'var(--color-sky-soft)', color: 'var(--color-sky-primary)' }}>
            👥
          </div>
          <div className="status-info">
            <h3>{t('udhaar.active_customers')}</h3>
            <p className="udhaar-stat-val">{customers.length}</p>
            <span className="badge badge-info">{t('dashboard.active')}</span>
          </div>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="card udhaar-search-card" style={{ marginTop: 'var(--space-md)' }}>
        <input
          type="text"
          className="form-control"
          placeholder={t('udhaar.search_placeholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Customers Table */}
      <div className="card udhaar-table-card" style={{ marginTop: 'var(--space-md)' }}>
        {loading ? (
          <div className="loading-state">
            <span className="spinner" />
            <p>{t('common.loading')}</p>
          </div>
        ) : customers.length === 0 ? (
          <div className="empty-state">
            <p>{t('udhaar.no_customers')}</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table udhaar-table">
              <thead>
                <tr>
                  <th>{t('udhaar.customer_name')}</th>
                  <th>{t('udhaar.phone')}</th>
                  <th>{t('udhaar.address')}</th>
                  <th>{t('udhaar.current_balance')} (₹)</th>
                  <th>{t('udhaar.credit_limit')} (₹)</th>
                  <th>{t('udhaar.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => {
                  const bal = c.current_balance || 0
                  const isDebit = bal > 0
                  const isAdvance = bal < 0

                  return (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.name}</strong>
                      </td>
                      <td>{c.phone || '—'}</td>
                      <td>{c.address || '—'}</td>
                      <td>
                        <span
                          className={`khata-balance-tag ${
                            isDebit ? 'balance-due' : isAdvance ? 'balance-advance' : 'balance-settled'
                          }`}
                        >
                          ₹{paiseToRupees(Math.abs(bal))}{' '}
                          {isDebit ? '(Due)' : isAdvance ? '(Adv)' : '(Nil)'}
                        </span>
                      </td>
                      <td>
                        {c.credit_limit > 0 ? `₹${paiseToRupees(c.credit_limit)}` : 'Unlimited'}
                      </td>
                      <td>
                        <div className="table-action-group">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline text-success"
                            onClick={() => openPaymentModal(c)}
                          >
                            💵 {t('udhaar.record_payment')}
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline"
                            onClick={() => openLedgerModal(c)}
                          >
                            📖 {t('udhaar.view_ledger')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Payment (Jama) Modal */}
      {paymentCustomer && (
        <div className="modal-overlay" onClick={() => setPaymentCustomer(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t('udhaar.payment_modal_title')}</h3>
              <button
                type="button"
                className="close-button"
                onClick={() => setPaymentCustomer(null)}
              >
                ✕
              </button>
            </div>

            <div className="payment-customer-meta">
              <p>
                <strong>{paymentCustomer.name}</strong>
                {paymentCustomer.phone ? ` • ${paymentCustomer.phone}` : ''}
              </p>
              <p className="payment-current-bal">
                {t('udhaar.balance_before')}:{' '}
                <span className="text-warning font-bold">
                  ₹{paiseToRupees(paymentCustomer.current_balance)}
                </span>
              </p>
            </div>

            <form onSubmit={handleRecordPayment}>
              <div className="form-group">
                <label className="form-label">{t('udhaar.payment_amount')} *</label>
                <input
                  type="number"
                  step="any"
                  className="form-control form-control-lg"
                  placeholder="0.00"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label">{t('udhaar.payment_mode')}</label>
                <div className="pos-payment-options">
                  <button
                    type="button"
                    className={`payment-option-btn ${paymentMode === 'cash' ? 'active' : ''}`}
                    onClick={() => setPaymentMode('cash')}
                  >
                    💵 {t('quick_sale.payment_cash')}
                  </button>
                  <button
                    type="button"
                    className={`payment-option-btn ${paymentMode === 'upi' ? 'active' : ''}`}
                    onClick={() => setPaymentMode('upi')}
                  >
                    📱 {t('quick_sale.payment_upi')}
                  </button>
                  <button
                    type="button"
                    className={`payment-option-btn ${paymentMode === 'bank_transfer' ? 'active' : ''}`}
                    onClick={() => setPaymentMode('bank_transfer')}
                  >
                    🏦 Bank
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">{t('udhaar.notes')}</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder={t('udhaar.notes_placeholder')}
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                />
              </div>

              {/* Dynamic Preview of New Balance */}
              {paymentAmount && Number(paymentAmount) > 0 && (
                <div className="alert alert-info">
                  {t('udhaar.balance_after')}:{' '}
                  <strong>
                    ₹
                    {paiseToRupees(
                      paymentCustomer.current_balance - rupeesToPaise(paymentAmount)
                    )}
                  </strong>
                </div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setPaymentCustomer(null)}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submittingPayment}
                >
                  {submittingPayment ? <span className="spinner" /> : t('udhaar.save_payment')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer Ledger History Modal */}
      {activeCustomer && (
        <div className="modal-overlay" onClick={() => setActiveCustomer(null)}>
          <div
            className="modal-card modal-lg"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '800px' }}
          >
            <div className="modal-header">
              <div>
                <h3>
                  📖 {activeCustomer.name} — {t('udhaar.ledger_title')}
                </h3>
                <p className="placeholder-copy">
                  {activeCustomer.phone ? `Phone: ${activeCustomer.phone}` : ''}{' '}
                  {activeCustomer.address ? `| Address: ${activeCustomer.address}` : ''}
                </p>
              </div>
              <button
                type="button"
                className="close-button"
                onClick={() => setActiveCustomer(null)}
              >
                ✕
              </button>
            </div>

            <div className="ledger-summary-banner">
              <span>{t('udhaar.current_balance')}:</span>
              <strong className="ledger-total-bal">
                ₹{paiseToRupees(activeCustomer.current_balance)}
              </strong>
            </div>

            <div className="table-responsive" style={{ maxHeight: '350px' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('udhaar.date')}</th>
                    <th>{t('udhaar.entry_type')}</th>
                    <th>{t('udhaar.notes')}</th>
                    <th>Debit (₹)</th>
                    <th>Credit (₹)</th>
                    <th>{t('udhaar.running_balance')} (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {(activeCustomer.ledger || []).length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 'var(--space-md)' }}>
                        {t('udhaar.no_entries')}
                      </td>
                    </tr>
                  ) : (
                    activeCustomer.ledger.map((entry) => {
                      const isCreditSale = entry.entry_type === 'credit_sale'
                      const isPayment = entry.entry_type === 'payment'
                      const isAdjustment = entry.entry_type === 'adjustment'

                      return (
                        <tr key={entry.id}>
                          <td>{entry.created_at}</td>
                          <td>
                            <span
                              className={`badge ${
                                isCreditSale
                                  ? 'badge-warning'
                                  : isPayment
                                    ? 'badge-success'
                                    : 'badge-info'
                              }`}
                            >
                              {isCreditSale && t('udhaar.type_credit_sale')}
                              {isPayment && t('udhaar.type_payment')}
                              {isAdjustment && t('udhaar.type_adjustment')}
                            </span>
                          </td>
                          <td>{entry.notes || '—'}</td>
                          <td className="text-danger">
                            {isCreditSale ? `₹${paiseToRupees(entry.amount)}` : '—'}
                          </td>
                          <td className="text-success">
                            {isPayment || isAdjustment ? `₹${paiseToRupees(entry.amount)}` : '—'}
                          </td>
                          <td>
                            <strong>₹{paiseToRupees(entry.balance_after)}</strong>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="modal-actions" style={{ marginTop: 'var(--space-md)' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setActiveCustomer(null)}
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add New Customer Modal */}
      {addCustomerOpen && (
        <div className="modal-overlay" onClick={() => setAddCustomerOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t('udhaar.customer_modal_title')}</h3>
              <button
                type="button"
                className="close-button"
                onClick={() => setAddCustomerOpen(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateCustomer}>
              <div className="form-group">
                <label className="form-label">{t('udhaar.customer_name')} *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder={t('udhaar.customer_name_placeholder')}
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                  required
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label">{t('udhaar.phone')}</label>
                <input
                  type="tel"
                  className="form-control"
                  placeholder="e.g. 9876543210"
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">{t('udhaar.address')}</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Near Bus Stand, Shop 4"
                  value={newCustomer.address}
                  onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">{t('udhaar.credit_limit')} (₹)</label>
                <input
                  type="number"
                  step="any"
                  className="form-control"
                  placeholder="0.00 (0 = unlimited)"
                  value={newCustomer.credit_limit}
                  onChange={(e) =>
                    setNewCustomer({ ...newCustomer, credit_limit: e.target.value })
                  }
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setAddCustomerOpen(false)}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submittingCustomer}
                >
                  {submittingCustomer ? <span className="spinner" /> : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
