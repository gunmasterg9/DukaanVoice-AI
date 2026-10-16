import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { useI18n } from '../i18n/I18nContext'
import { paiseToRupees, rupeesToPaise } from '../utils/formatters'

const CATEGORY_ICONS = {
  rent: '🏠',
  electricity: '⚡',
  transport: '🚚',
  wages: '👷',
  packaging: '📦',
  maintenance: '🔧',
  miscellaneous: '📑',
}

function getTodayIso() {
  return new Date().toISOString().split('T')[0]
}

export function Expenses() {
  const { t } = useI18n()

  const [expenses, setExpenses] = useState([])
  const [totalAmount, setTotalAmount] = useState(0)
  const [cashTotal, setCashTotal] = useState(0)
  const [upiTotal, setUpiTotal] = useState(0)
  const [bankTotal, setBankTotal] = useState(0)
  const [categoryTotals, setCategoryTotals] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  // Filters
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedMethod, setSelectedMethod] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [includeReversed, setIncludeReversed] = useState(false)

  // Add Expense Modal
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [formData, setFormData] = useState(() => ({
    expense_date: getTodayIso(),
    category: 'transport',
    amount: '',
    payment_method: 'cash',
    notes: '',
  }))
  const [submitting, setSubmitting] = useState(false)

  // Reversal Modal
  const [reversingItem, setReversingItem] = useState(null)
  const [reversalReason, setReversalReason] = useState('')
  const [reversing, setReversing] = useState(false)

  const [reloadTrigger, setReloadTrigger] = useState(0)
  const reload = () => setReloadTrigger((prev) => prev + 1)

  useEffect(() => {
    let ignore = false

    const params = {
      from_date: fromDate || undefined,
      to_date: toDate || undefined,
      category: selectedCategory || undefined,
      payment_method: selectedMethod || undefined,
      include_reversed: includeReversed,
      limit: 100,
    }

    api
      .getExpenses(params)
      .then((res) => {
        if (!ignore) {
          setExpenses(res.items || [])
          setTotalAmount(res.total_amount || 0)
          setCashTotal(res.cash_total || 0)
          setUpiTotal(res.upi_total || 0)
          setBankTotal(res.bank_total || 0)
          setCategoryTotals(res.category_totals || {})
          setError(null)
        }
      })
      .catch((err) => {
        if (!ignore) {
          setError(err.message || 'Failed to load expenses.')
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
  }, [selectedCategory, selectedMethod, fromDate, toDate, includeReversed, reloadTrigger])

  const handleCreateExpense = async (e) => {
    e.preventDefault()
    const amountPaise = rupeesToPaise(formData.amount)
    if (amountPaise <= 0) {
      setError('Amount must be greater than zero.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await api.createExpense({
        expense_date: formData.expense_date,
        category: formData.category,
        amount: amountPaise,
        payment_method: formData.payment_method,
        notes: formData.notes.trim(),
      })
      setIsAddOpen(false)
      setFormData({
        expense_date: new Date().toISOString().split('T')[0],
        category: 'transport',
        amount: '',
        payment_method: 'cash',
        notes: '',
      })
      setNotice(t('expenses.expense_added_success'))
      setTimeout(() => setNotice(null), 3000)
      reload()
    } catch (err) {
      setError(err.message || 'Failed to record expense.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleReverseExpense = async (e) => {
    e.preventDefault()
    if (!reversingItem) return
    setReversing(true)
    setError(null)
    try {
      await api.reverseExpense(reversingItem.id, reversalReason.trim())
      setReversingItem(null)
      setReversalReason('')
      setNotice(t('expenses.expense_reversed_success'))
      setTimeout(() => setNotice(null), 3000)
      reload()
    } catch (err) {
      setError(err.message || 'Failed to reverse expense.')
    } finally {
      setReversing(false)
    }
  }

  const categories = [
    'rent',
    'electricity',
    'transport',
    'wages',
    'packaging',
    'maintenance',
    'miscellaneous',
  ]

  return (
    <div className="expenses-container">
      {/* Header */}
      <div className="section-header">
        <div>
          <h2>💸 {t('expenses.title')}</h2>
          <p className="section-subtitle">{t('expenses.subtitle')}</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setIsAddOpen(true)}
        >
          ➕ {t('expenses.add_expense')}
        </button>
      </div>

      {notice && <div className="notice notice-success">{notice}</div>}
      {error && <div className="notice notice-error">{error}</div>}

      {/* Summary Cards */}
      <div className="metric-cards">
        <div className="metric-card">
          <span className="metric-label">{t('expenses.total_expenses')}</span>
          <span className="metric-value font-mono">₹{paiseToRupees(totalAmount)}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">💵 {t('expenses.cash_expenses')}</span>
          <span className="metric-value font-mono text-warning">
            ₹{paiseToRupees(cashTotal)}
          </span>
          <span className="metric-subtext">{t('expenses.affects_cash_drawer')}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">📱 {t('expenses.upi_expenses')}</span>
          <span className="metric-value font-mono text-info">
            ₹{paiseToRupees(upiTotal)}
          </span>
          <span className="metric-subtext">{t('expenses.online_digital')}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">🏦 {t('expenses.bank_expenses')}</span>
          <span className="metric-value font-mono">₹{paiseToRupees(bankTotal)}</span>
          <span className="metric-subtext">{t('expenses.bank_cheque')}</span>
        </div>
      </div>

      {/* Category Quick Filter Chips */}
      <div className="category-chips-bar">
        <button
          type="button"
          className={`chip-btn ${selectedCategory === '' ? 'active' : ''}`}
          onClick={() => setSelectedCategory('')}
        >
          {t('common.all')}
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            className={`chip-btn ${selectedCategory === cat ? 'active' : ''}`}
            onClick={() => setSelectedCategory(cat)}
          >
            {CATEGORY_ICONS[cat] || '📑'} {t(`expenses.cat_${cat}`)}
            {categoryTotals[cat] ? ` (₹${paiseToRupees(categoryTotals[cat])})` : ''}
          </button>
        ))}
      </div>

      {/* Secondary Filters Bar */}
      <div className="filter-bar">
        <div className="filter-group">
          <label className="form-label">{t('reports.start_date')}</label>
          <input
            type="date"
            className="form-control"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label className="form-label">{t('reports.end_date')}</label>
          <input
            type="date"
            className="form-control"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label className="form-label">{t('expenses.payment_mode')}</label>
          <select
            className="form-control"
            value={selectedMethod}
            onChange={(e) => setSelectedMethod(e.target.value)}
          >
            <option value="">{t('common.all')}</option>
            <option value="cash">💵 {t('quick_sale.payment_cash')}</option>
            <option value="upi">📱 {t('quick_sale.payment_upi')}</option>
            <option value="bank_transfer">🏦 {t('expenses.bank_transfer')}</option>
          </select>
        </div>
        <div className="filter-group filter-checkbox">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={includeReversed}
              onChange={(e) => setIncludeReversed(e.target.checked)}
            />
            {t('expenses.include_reversed')}
          </label>
        </div>
        {(selectedCategory || selectedMethod || fromDate || toDate || includeReversed) && (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => {
              setSelectedCategory('')
              setSelectedMethod('')
              setFromDate('')
              setToDate('')
              setIncludeReversed(false)
            }}
          >
            {t('common.reset')}
          </button>
        )}
      </div>

      {/* Expenses Table */}
      <div className="card">
        {loading ? (
          <div className="loading-state">
            <span className="spinner" /> {t('common.loading')}
          </div>
        ) : expenses.length === 0 ? (
          <div className="empty-state">
            <p className="empty-title">📑 {t('expenses.no_expenses')}</p>
            <p className="empty-subtitle">{t('expenses.no_expenses_hint')}</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('common.date')}</th>
                  <th>{t('expenses.category')}</th>
                  <th>{t('expenses.payment_mode')}</th>
                  <th>{t('expenses.notes')}</th>
                  <th className="text-right">{t('common.amount')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((item) => {
                  const isReversed = item.status === 'reversed'
                  return (
                    <tr key={item.id} className={isReversed ? 'row-reversed' : ''}>
                      <td>{item.expense_date}</td>
                      <td>
                        <span className="category-tag">
                          {CATEGORY_ICONS[item.category] || '📑'}{' '}
                          {t(`expenses.cat_${item.category}`)}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            item.payment_method === 'cash'
                              ? 'badge-warning'
                              : item.payment_method === 'upi'
                              ? 'badge-info'
                              : 'badge-secondary'
                          }`}
                        >
                          {item.payment_method === 'cash'
                            ? `💵 ${t('quick_sale.payment_cash')}`
                            : item.payment_method === 'upi'
                            ? `📱 ${t('quick_sale.payment_upi')}`
                            : `🏦 ${t('expenses.bank_transfer')}`}
                        </span>
                      </td>
                      <td>
                        {item.notes}
                        {item.reversal_reason && (
                          <div className="text-muted text-xs">
                            ↳ {t('expenses.reversal_reason')}: {item.reversal_reason}
                          </div>
                        )}
                      </td>
                      <td className="text-right font-mono font-bold">
                        ₹{paiseToRupees(item.amount)}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            isReversed ? 'badge-danger' : 'badge-success'
                          }`}
                        >
                          {isReversed ? t('expenses.reversed') : t('expenses.active')}
                        </span>
                      </td>
                      <td>
                        {!isReversed && (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline text-danger"
                            onClick={() => setReversingItem(item)}
                          >
                            ↩️ {t('expenses.reverse')}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Expense Modal */}
      {isAddOpen && (
        <div className="modal-overlay" onClick={() => setIsAddOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>➕ {t('expenses.add_expense')}</h3>
              <button
                type="button"
                className="close-button"
                onClick={() => setIsAddOpen(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateExpense}>
              <div className="form-group">
                <label className="form-label">{t('common.date')} *</label>
                <input
                  type="date"
                  className="form-control"
                  value={formData.expense_date}
                  onChange={(e) =>
                    setFormData({ ...formData, expense_date: e.target.value })
                  }
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">{t('expenses.category')} *</label>
                <select
                  className="form-control"
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
                  }
                  required
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {CATEGORY_ICONS[cat]} {t(`expenses.cat_${cat}`)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">{t('common.amount')} (₹) *</label>
                <input
                  type="number"
                  step="any"
                  className="form-control form-control-lg"
                  placeholder="0.00"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  required
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label">{t('expenses.payment_mode')} *</label>
                <div className="pos-payment-options">
                  <button
                    type="button"
                    className={`payment-option-btn ${
                      formData.payment_method === 'cash' ? 'active' : ''
                    }`}
                    onClick={() =>
                      setFormData({ ...formData, payment_method: 'cash' })
                    }
                  >
                    💵 {t('quick_sale.payment_cash')}
                  </button>
                  <button
                    type="button"
                    className={`payment-option-btn ${
                      formData.payment_method === 'upi' ? 'active' : ''
                    }`}
                    onClick={() =>
                      setFormData({ ...formData, payment_method: 'upi' })
                    }
                  >
                    📱 {t('quick_sale.payment_upi')}
                  </button>
                  <button
                    type="button"
                    className={`payment-option-btn ${
                      formData.payment_method === 'bank_transfer' ? 'active' : ''
                    }`}
                    onClick={() =>
                      setFormData({ ...formData, payment_method: 'bank_transfer' })
                    }
                  >
                    🏦 {t('expenses.bank_transfer')}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">{t('expenses.notes')}</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder={t('expenses.notes_placeholder')}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setIsAddOpen(false)}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting}
                >
                  {submitting ? <span className="spinner" /> : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reverse Expense Confirmation Modal */}
      {reversingItem && (
        <div className="modal-overlay" onClick={() => setReversingItem(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>↩️ {t('expenses.reverse_modal_title')}</h3>
              <button
                type="button"
                className="close-button"
                onClick={() => setReversingItem(null)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleReverseExpense}>
              <div className="notice notice-warning">
                {t('expenses.reverse_warning')}
              </div>
              <p>
                <strong>{CATEGORY_ICONS[reversingItem.category]} {t(`expenses.cat_${reversingItem.category}`)}</strong>:{' '}
                ₹{paiseToRupees(reversingItem.amount)} ({reversingItem.expense_date})
              </p>
              <div className="form-group">
                <label className="form-label">{t('expenses.reversal_reason')} *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Duplicate entry, returned item"
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setReversingItem(null)}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="btn btn-danger"
                  disabled={reversing}
                >
                  {reversing ? <span className="spinner" /> : t('expenses.confirm_reverse')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
