import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { useI18n } from '../i18n/I18nContext'
import { paiseToRupees, rupeesToPaise } from '../utils/formatters'

function getTodayIso() {
  return new Date().toISOString().split('T')[0]
}

export function CashClosing() {
  const { t } = useI18n()

  const [selectedDate, setSelectedDate] = useState(() => getTodayIso())
  const [preview, setPreview] = useState(null)
  const [openingCashInput, setOpeningCashInput] = useState('')
  const [countedCashInput, setCountedCashInput] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [confirmFinalizeOpen, setConfirmFinalizeOpen] = useState(false)

  // Past closings history
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(true)

  const [reloadTrigger, setReloadTrigger] = useState(0)
  const reload = () => setReloadTrigger((prev) => prev + 1)

  // Fetch preview for selected date
  useEffect(() => {
    let ignore = false

    api
      .getCashClosingPreview({ business_date: selectedDate })
      .then((res) => {
        if (!ignore) {
          setPreview(res)
          if (res.existing_closing) {
            setCountedCashInput(paiseToRupees(res.existing_closing.actual_cash))
            setNotes(res.existing_closing.notes || '')
            setOpeningCashInput(paiseToRupees(res.existing_closing.opening_cash))
          } else {
            setOpeningCashInput(paiseToRupees(res.opening_cash))
          }
        }
      })
      .catch((err) => {
        if (!ignore) {
          setError(err.message || 'Failed to load cash closing preview.')
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
  }, [selectedDate, reloadTrigger])

  // Fetch history
  useEffect(() => {
    let ignore = false
    api
      .listCashClosings({ limit: 15 })
      .then((res) => {
        if (!ignore) {
          setHistory(res.items || [])
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!ignore) {
          setLoadingHistory(false)
        }
      })

    return () => {
      ignore = true
    }
  }, [reloadTrigger])

  // Expected cash calculation based on live input
  const openingPaise =
    openingCashInput !== '' ? rupeesToPaise(openingCashInput) : preview?.opening_cash || 0
  const cashSalesPaise = preview?.cash_sales || 0
  const cashRepaymentsPaise = preview?.cash_repayments || 0
  const cashExpensesPaise = preview?.cash_expenses || 0
  const cashRefundsPaise = preview?.cash_refunds || 0

  const computedExpectedPaise =
    openingPaise +
    cashSalesPaise +
    cashRepaymentsPaise -
    cashExpensesPaise -
    cashRefundsPaise

  const countedPaise =
    countedCashInput !== '' ? rupeesToPaise(countedCashInput) : 0
  const differencePaise = countedPaise - computedExpectedPaise

  const isFinalized = preview?.is_already_closed || false

  const handleSaveDraft = async (e) => {
    e.preventDefault()
    if (countedCashInput === '') {
      setError(t('cash_closing.enter_counted_cash'))
      return
    }

    setSaving(true)
    setError(null)
    try {
      await api.createCashClosing({
        business_date: selectedDate,
        opening_cash: openingPaise,
        actual_cash: countedPaise,
        notes: notes.trim(),
        finalize: false,
      })
      setNotice(t('cash_closing.draft_saved_success'))
      setTimeout(() => setNotice(null), 3000)
      reload()
    } catch (err) {
      setError(err.message || 'Failed to save draft.')
    } finally {
      setSaving(false)
    }
  }

  const handleConfirmFinalize = async () => {
    setFinalizing(true)
    setError(null)
    try {
      if (!preview?.existing_closing) {
        // Create as finalized
        await api.createCashClosing({
          business_date: selectedDate,
          opening_cash: openingPaise,
          actual_cash: countedPaise,
          notes: notes.trim(),
          finalize: true,
        })
      } else {
        // Finalize existing
        await api.finalizeCashClosing(selectedDate)
      }
      setConfirmFinalizeOpen(false)
      setNotice(t('cash_closing.finalized_success'))
      setTimeout(() => setNotice(null), 3000)
      reload()
    } catch (err) {
      setError(err.message || 'Failed to finalize cash closing.')
    } finally {
      setFinalizing(false)
    }
  }

  return (
    <div className="cash-closing-container">
      {/* Header */}
      <div className="section-header">
        <div>
          <h2>🔒 {t('cash_closing.title')}</h2>
          <p className="section-subtitle">{t('cash_closing.subtitle')}</p>
        </div>
        <div className="date-picker-wrapper">
          <label className="form-label">{t('cash_closing.business_date')}:</label>
          <input
            type="date"
            className="form-control"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>
      </div>

      {notice && <div className="notice notice-success">{notice}</div>}
      {error && <div className="notice notice-error">{error}</div>}

      {isFinalized && (
        <div className="notice notice-warning">
          🔒 {t('cash_closing.locked_notice')} (
          {preview?.existing_closing?.closed_at || ''})
        </div>
      )}

      {loading ? (
        <div className="loading-state">
          <span className="spinner" /> {t('common.loading')}
        </div>
      ) : (
        <div className="cash-closing-grid">
          {/* Main Reconciliation Card */}
          <div className="card cash-reconciliation-card">
            <h3 className="card-title">
              📊 {t('cash_closing.reconciliation_math')} — {selectedDate}
            </h3>

            <div className="reconciliation-breakdown">
              {/* Row 1: Opening cash */}
              <div className="breakdown-row">
                <span className="breakdown-label">
                  1. {t('cash_closing.opening_cash')}
                </span>
                <div className="breakdown-input-wrapper">
                  <span className="currency-prefix">₹</span>
                  <input
                    type="number"
                    step="any"
                    disabled={isFinalized}
                    className="form-control form-control-sm text-right font-mono"
                    value={openingCashInput}
                    onChange={(e) => setOpeningCashInput(e.target.value)}
                  />
                </div>
              </div>

              {/* Row 2: Cash sales */}
              <div className="breakdown-row">
                <span className="breakdown-label text-success">
                  2. ➕ {t('cash_closing.cash_sales')} ({t('quick_sale.payment_cash')})
                </span>
                <span className="breakdown-val text-success font-mono font-bold">
                  +₹{paiseToRupees(cashSalesPaise)}
                </span>
              </div>

              {/* Row 3: Cash repayments */}
              <div className="breakdown-row">
                <span className="breakdown-label text-success">
                  3. ➕ {t('cash_closing.cash_repayments')} (Udhaar Jama)
                </span>
                <span className="breakdown-val text-success font-mono font-bold">
                  +₹{paiseToRupees(cashRepaymentsPaise)}
                </span>
              </div>

              {/* Row 4: Cash expenses */}
              <div className="breakdown-row">
                <span className="breakdown-label text-danger">
                  4. ➖ {t('cash_closing.cash_expenses')} ({t('expenses.title')})
                </span>
                <span className="breakdown-val text-danger font-mono font-bold">
                  -₹{paiseToRupees(cashExpensesPaise)}
                </span>
              </div>

              {/* Row 5: Cash refunds/reversals */}
              {cashRefundsPaise > 0 && (
                <div className="breakdown-row">
                  <span className="breakdown-label text-danger">
                    5. ➖ {t('cash_closing.cash_refunds')}
                  </span>
                  <span className="breakdown-val text-danger font-mono font-bold">
                    -₹{paiseToRupees(cashRefundsPaise)}
                  </span>
                </div>
              )}

              {/* Divider */}
              <hr className="breakdown-divider" />

              {/* Row 6: Expected cash drawer */}
              <div className="breakdown-row expected-row">
                <span className="breakdown-label font-bold text-lg">
                  🎯 {t('cash_closing.expected_cash')}
                </span>
                <span className="breakdown-val font-bold text-xl font-mono">
                  ₹{paiseToRupees(computedExpectedPaise)}
                </span>
              </div>
            </div>

            {/* Note about physical cash integrity */}
            <p className="text-xs text-muted cash-rule-note">
              🛡️ {t('cash_closing.physical_cash_rule_note')}
            </p>
          </div>

          {/* Physical Cash Counting & Review Card */}
          <div className="card cash-counting-card">
            <h3 className="card-title">💵 {t('cash_closing.physical_count_title')}</h3>

            <form onSubmit={handleSaveDraft}>
              <div className="form-group">
                <label className="form-label font-bold">
                  {t('cash_closing.counted_cash')} (₹) *
                </label>
                <input
                  type="number"
                  step="any"
                  disabled={isFinalized}
                  className="form-control form-control-lg font-mono text-xl"
                  placeholder="0.00"
                  value={countedCashInput}
                  onChange={(e) => setCountedCashInput(e.target.value)}
                  required
                />
              </div>

              {/* Live difference pill */}
              <div className="difference-display-container">
                <span className="diff-label">{t('cash_closing.difference')}:</span>
                {differencePaise === 0 ? (
                  <span className="badge badge-success text-base">
                    🎯 {t('cash_closing.exact_match')} (₹0.00)
                  </span>
                ) : differencePaise > 0 ? (
                  <span className="badge badge-info text-base">
                    🟢 {t('cash_closing.surplus')} (+₹{paiseToRupees(differencePaise)})
                  </span>
                ) : (
                  <span className="badge badge-danger text-base">
                    🔴 {t('cash_closing.shortage')} (-₹{paiseToRupees(Math.abs(differencePaise))})
                  </span>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">{t('cash_closing.closing_notes')}</label>
                <textarea
                  className="form-control"
                  rows={3}
                  disabled={isFinalized}
                  placeholder={t('cash_closing.notes_placeholder')}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {!isFinalized ? (
                <div className="closing-action-buttons">
                  <button
                    type="submit"
                    className="btn btn-outline"
                    disabled={saving || finalizing}
                  >
                    {saving ? <span className="spinner" /> : `💾 ${t('cash_closing.save_draft')}`}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={saving || finalizing || countedCashInput === ''}
                    onClick={() => setConfirmFinalizeOpen(true)}
                  >
                    🔒 {t('cash_closing.finalize_day')}
                  </button>
                </div>
              ) : (
                <div className="finalized-seal">
                  ✅ {t('cash_closing.register_closed')}
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Historical Closings */}
      <div className="card history-card">
        <h3 className="card-title">📅 {t('cash_closing.history_title')}</h3>
        {loadingHistory ? (
          <div className="loading-state">
            <span className="spinner" /> {t('common.loading')}
          </div>
        ) : history.length === 0 ? (
          <p className="text-muted text-center py-4">{t('cash_closing.no_history')}</p>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('cash_closing.business_date')}</th>
                  <th className="text-right">{t('cash_closing.opening_cash')}</th>
                  <th className="text-right text-success">{t('cash_closing.cash_in')}</th>
                  <th className="text-right text-danger">{t('cash_closing.cash_out')}</th>
                  <th className="text-right font-bold">{t('cash_closing.expected_cash')}</th>
                  <th className="text-right font-bold">{t('cash_closing.counted_cash')}</th>
                  <th className="text-right">{t('cash_closing.difference')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('common.notes')}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => {
                  const cashIn = item.cash_sales + item.cash_repayments
                  const cashOut = item.cash_expenses + item.cash_refunds
                  const isClosed = item.status === 'finalized'
                  return (
                    <tr
                      key={item.id}
                      className="cursor-pointer"
                      onClick={() => setSelectedDate(item.business_date)}
                    >
                      <td className="font-bold">{item.business_date}</td>
                      <td className="text-right font-mono">₹{paiseToRupees(item.opening_cash)}</td>
                      <td className="text-right font-mono text-success">+₹{paiseToRupees(cashIn)}</td>
                      <td className="text-right font-mono text-danger">-₹{paiseToRupees(cashOut)}</td>
                      <td className="text-right font-mono font-bold">₹{paiseToRupees(item.expected_cash)}</td>
                      <td className="text-right font-mono font-bold">₹{paiseToRupees(item.actual_cash)}</td>
                      <td className="text-right font-mono">
                        <span
                          className={`badge ${
                            item.difference === 0
                              ? 'badge-success'
                              : item.difference > 0
                              ? 'badge-info'
                              : 'badge-danger'
                          }`}
                        >
                          {item.difference > 0 ? '+' : ''}₹{paiseToRupees(item.difference)}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${isClosed ? 'badge-primary' : 'badge-secondary'}`}>
                          {isClosed ? `🔒 ${t('cash_closing.status_finalized')}` : `📝 ${t('cash_closing.status_draft')}`}
                        </span>
                      </td>
                      <td className="text-muted text-sm">{item.notes}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmation Modal for Finalization */}
      {confirmFinalizeOpen && (
        <div className="modal-overlay" onClick={() => setConfirmFinalizeOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>⚠️ {t('cash_closing.confirm_title')}</h3>
              <button
                type="button"
                className="close-button"
                onClick={() => setConfirmFinalizeOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="confirm-body">
              <p>{t('cash_closing.confirm_text')}</p>
              <div className="confirm-summary-box">
                <p>
                  📅 <strong>{t('cash_closing.business_date')}</strong>: {selectedDate}
                </p>
                <p>
                  🎯 <strong>{t('cash_closing.expected_cash')}</strong>: ₹
                  {paiseToRupees(computedExpectedPaise)}
                </p>
                <p>
                  💵 <strong>{t('cash_closing.counted_cash')}</strong>: ₹
                  {paiseToRupees(countedPaise)}
                </p>
                <p>
                  ⚖️ <strong>{t('cash_closing.difference')}</strong>:{' '}
                  {differencePaise === 0
                    ? `Exact Match (₹0.00)`
                    : `${differencePaise > 0 ? '+' : ''}₹${paiseToRupees(differencePaise)}`}
                </p>
              </div>
              <p className="text-danger text-sm font-bold">
                {t('cash_closing.finalization_lock_warning')}
              </p>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setConfirmFinalizeOpen(false)}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={finalizing}
                onClick={handleConfirmFinalize}
              >
                {finalizing ? <span className="spinner" /> : `🔒 ${t('cash_closing.confirm_lock_btn')}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
