import { useEffect, useState } from 'react'
import { api } from '../services/api'
import {
  formatTransactionStatus,
  formatTransactionType,
  milliToQty,
  paiseToRupees,
  qtyToMilli,
  rupeesToPaise,
  validateTransactionDraft,
} from '../utils/formatters'

export function Transactions() {
  const [transactions, setTransactions] = useState([])
  const [total, setTotal] = useState(0)
  const [totalRevenue, setTotalRevenue] = useState(0)
  const [totalExpense, setTotalExpense] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  // Filters
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [page, setPage] = useState(0)
  const pageSize = 15

  // Modals: null | { type: 'create', initialType: 'sale' | 'purchase' } | { type: 'review', transaction } | { type: 'detail', transactionId } | { type: 'reverse', transaction }
  const [activeModal, setActiveModal] = useState(null)

  const showNotice = (msg, tone = 'success') => {
    setNotice({ message: msg, tone })
    setTimeout(() => setNotice(null), 4500)
  }

  const fetchTransactions = () => {
    setLoading(true)
    setError(null)

    const params = {
      limit: pageSize,
      offset: page * pageSize,
    }
    if (typeFilter) params.type = typeFilter
    if (statusFilter) params.status = statusFilter
    if (startDate) params.start_date = startDate
    if (endDate) params.end_date = endDate

    api
      .getTransactions(params)
      .then((data) => {
        setTransactions(data.items || [])
        setTotal(data.total || 0)
        setTotalRevenue(data.total_revenue || 0)
        setTotalExpense(data.total_expense || 0)
        setError(null)
      })
      .catch((err) => {
        setError(err.message || 'Unable to load transactions.')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let ignore = false
    const params = {
      limit: pageSize,
      offset: page * pageSize,
    }
    if (typeFilter) params.type = typeFilter
    if (statusFilter) params.status = statusFilter
    if (startDate) params.start_date = startDate
    if (endDate) params.end_date = endDate

    api
      .getTransactions(params)
      .then((data) => {
        if (!ignore) {
          setTransactions(data.items || [])
          setTotal(data.total || 0)
          setTotalRevenue(data.total_revenue || 0)
          setTotalExpense(data.total_expense || 0)
          setError(null)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!ignore) {
          setError(err.message || 'Unable to load transactions.')
          setLoading(false)
        }
      })

    return () => {
      ignore = true
    }
  }, [typeFilter, statusFilter, startDate, endDate, page])

  const handleConfirm = (transactionId) => {
    api
      .confirmTransaction(transactionId)
      .then((confirmed) => {
        showNotice(`Transaction #${confirmed.id} confirmed and inventory updated.`)
        setActiveModal(null)
        fetchTransactions()
      })
      .catch((err) => {
        showNotice(err.message || 'Failed to confirm transaction.', 'danger')
      })
  }

  const handleReverse = (transactionId) => {
    api
      .reverseTransaction(transactionId)
      .then((rev) => {
        showNotice(`Transaction #${rev.id} reversed with compensating stock movements.`)
        setActiveModal(null)
        fetchTransactions()
      })
      .catch((err) => {
        showNotice(err.message || 'Failed to reverse transaction.', 'danger')
      })
  }

  return (
    <div className="transactions-view">
      {/* Top Header */}
      <div className="section-header">
        <div>
          <h2>Sales & Purchase Register</h2>
          <p className="subtitle">
            Record sales drafts, verify customer orders, confirm stock deductions, and manage supplier purchases.
          </p>
        </div>
        <div className="action-buttons-group">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setActiveModal({ type: 'create', initialType: 'sale' })}
          >
            + New Sale Draft
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setActiveModal({ type: 'create', initialType: 'purchase' })}
          >
            + New Purchase Draft
          </button>
        </div>
      </div>

      {/* Notifications */}
      {notice && (
        <div className={`alert-banner alert-${notice.tone}`}>
          <span>{notice.message}</span>
          <button type="button" className="close-btn" onClick={() => setNotice(null)}>
            ×
          </button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="status-grid">
        <div className="status-card">
          <div className="status-icon backend">₹</div>
          <div className="status-info">
            <span className="stat-label">Confirmed Sales Revenue</span>
            <span className="stat-val selling-price">{paiseToRupees(totalRevenue)}</span>
            <span className="stat-sub">From confirmed sales in register</span>
          </div>
        </div>

        <div className="status-card">
          <div className="status-icon database">🛒</div>
          <div className="status-info">
            <span className="stat-label">Confirmed Purchase Expenditure</span>
            <span className="stat-val">{paiseToRupees(totalExpense)}</span>
            <span className="stat-sub">From confirmed vendor purchases</span>
          </div>
        </div>

        <div className="status-card">
          <div className="status-icon phase">📋</div>
          <div className="status-info">
            <span className="stat-label">Total Transactions</span>
            <span className="stat-val">{total}</span>
            <span className="stat-sub">Drafts, confirmed, and reversals</span>
          </div>
        </div>
      </div>

      {/* Financial clarity note */}
      <div className="financial-note-banner">
        <span>ℹ️ <strong>Financial note:</strong> Revenue reflects gross confirmed sales receipts. Revenue does not equal net profit. Inventory is updated strictly upon explicit confirmation.</span>
      </div>

      {/* Filter and Query Toolbar */}
      <div className="toolbar-card">
        <div className="toolbar-filters">
          <select
            className="form-input filter-select"
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value)
              setPage(0)
            }}
          >
            <option value="">All Types (Sales & Purchases)</option>
            <option value="sale">Sales Only</option>
            <option value="purchase">Purchases Only</option>
          </select>

          <select
            className="form-input filter-select"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setPage(0)
            }}
          >
            <option value="">All Statuses</option>
            <option value="draft">Drafts Only</option>
            <option value="confirmed">Confirmed Only</option>
            <option value="reversed">Reversed Only</option>
          </select>

          <div className="date-filter-group">
            <label>From:</label>
            <input
              type="date"
              className="form-input date-input"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value)
                setPage(0)
              }}
            />
          </div>

          <div className="date-filter-group">
            <label>To:</label>
            <input
              type="date"
              className="form-input date-input"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value)
                setPage(0)
              }}
            />
          </div>

          {(typeFilter || statusFilter || startDate || endDate) && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                setTypeFilter('')
                setStatusFilter('')
                setStartDate('')
                setEndDate('')
                setPage(0)
              }}
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Transactions Table Card */}
      <div className="card table-card">
        {loading ? (
          <div className="table-loading">
            <div className="spinner" />
            <p>Loading transactions…</p>
          </div>
        ) : error ? (
          <div className="table-error">
            <p>{error}</p>
            <button type="button" className="btn btn-outline" onClick={fetchTransactions}>
              Retry
            </button>
          </div>
        ) : transactions.length === 0 ? (
          <div className="table-empty">
            <div className="empty-icon">🧾</div>
            <h3>No transactions found</h3>
            <p>
              {typeFilter || statusFilter || startDate || endDate
                ? 'No transactions matched the selected filters.'
                : 'Create your first sale draft to record customer orders and update shop stock.'}
            </p>
            {!typeFilter && !statusFilter && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setActiveModal({ type: 'create', initialType: 'sale' })}
              >
                + Create First Sale Draft
              </button>
            )}
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Date & Time</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Items Summary</th>
                  <th>Total Amount</th>
                  <th className="th-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  const typeBadge = formatTransactionType(tx.type)
                  const statusBadge = formatTransactionStatus(tx.status)
                  const itemsSummary = tx.items
                    .map((it) => `${it.product_name} (${milliToQty(it.quantity)} ${it.unit})`)
                    .join(', ')

                  return (
                    <tr key={tx.id} className={`tx-row tx-row-${tx.status}`}>
                      <td className="tx-id-cell">#{tx.id}</td>
                      <td>
                        <div className="date-cell">
                          <span>{new Date(tx.created_at).toLocaleDateString()}</span>
                          <span className="time-sub">
                            {new Date(tx.created_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={`badge badge-${typeBadge.tone}`}>{typeBadge.label}</span>
                      </td>
                      <td>
                        <span className={`badge badge-${statusBadge.tone}`}>
                          {statusBadge.label}
                        </span>
                      </td>
                      <td className="items-summary-cell" title={itemsSummary}>
                        <span className="summary-text">{itemsSummary || '—'}</span>
                        {tx.original_instruction && (
                          <span className="note-text">Note: {tx.original_instruction}</span>
                        )}
                      </td>
                      <td>
                        <span className={`total-cell ${tx.type === 'sale' ? 'selling-price' : ''}`}>
                          {paiseToRupees(tx.total_amount)}
                        </span>
                      </td>
                      <td className="td-actions">
                        <button
                          type="button"
                          className="btn-action"
                          onClick={() => setActiveModal({ type: 'detail', transactionId: tx.id })}
                        >
                          View
                        </button>
                        {tx.status === 'draft' && (
                          <button
                            type="button"
                            className="btn-action btn-action-success"
                            onClick={() => setActiveModal({ type: 'review', transaction: tx })}
                          >
                            Review & Confirm
                          </button>
                        )}
                        {tx.status === 'confirmed' && (
                          <button
                            type="button"
                            className="btn-action btn-action-danger"
                            onClick={() => setActiveModal({ type: 'reverse', transaction: tx })}
                          >
                            Reverse
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

        {/* Pagination */}
        {total > pageSize && (
          <div className="pagination-bar">
            <span>
              Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total} transactions
            </span>
            <div className="pagination-controls">
              <button
                type="button"
                className="btn btn-outline"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </button>
              <span className="page-number">Page {page + 1}</span>
              <button
                type="button"
                className="btn btn-outline"
                disabled={(page + 1) * pageSize >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {activeModal?.type === 'create' && (
        <TransactionDraftModal
          initialType={activeModal.initialType}
          onClose={() => setActiveModal(null)}
          onSuccess={(draft) => {
            showNotice(`Draft transaction #${draft.id} created. Review before confirming.`)
            fetchTransactions()
            setActiveModal({ type: 'review', transaction: draft })
          }}
        />
      )}

      {activeModal?.type === 'review' && (
        <TransactionReviewModal
          transaction={activeModal.transaction}
          onClose={() => setActiveModal(null)}
          onConfirm={() => handleConfirm(activeModal.transaction.id)}
        />
      )}

      {activeModal?.type === 'detail' && (
        <TransactionDetailModal
          transactionId={activeModal.transactionId}
          onClose={() => setActiveModal(null)}
          onConfirm={() => handleConfirm(activeModal.transactionId)}
          onReverse={(tx) => setActiveModal({ type: 'reverse', transaction: tx })}
        />
      )}

      {activeModal?.type === 'reverse' && (
        <TransactionReverseModal
          transaction={activeModal.transaction}
          onClose={() => setActiveModal(null)}
          onConfirm={() => handleReverse(activeModal.transaction.id)}
        />
      )}
    </div>
  )
}

function TransactionDraftModal({ initialType, onClose, onSuccess }) {
  const [type, setType] = useState(initialType || 'sale')
  const [instruction, setInstruction] = useState('')
  const [items, setItems] = useState([
    { product_id: '', quantity: '1', unit: '', unit_price: '' },
  ])
  const [availableProducts, setAvailableProducts] = useState([])
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [apiError, setApiError] = useState(null)

  useEffect(() => {
    let ignore = false
    api
      .getProducts({ active: true, limit: 100 })
      .then((data) => {
        if (!ignore) {
          setAvailableProducts(data.items || [])
          setLoadingProducts(false)
        }
      })
      .catch(() => {
        if (!ignore) setLoadingProducts(false)
      })
    return () => {
      ignore = true
    }
  }, [])

  const handleProductSelect = (idx, productIdStr) => {
    const pId = parseInt(productIdStr, 10)
    const found = availableProducts.find((p) => p.id === pId)
    setItems((prev) => {
      const copy = [...prev]
      if (found) {
        copy[idx] = {
          ...copy[idx],
          product_id: found.id,
          unit: found.base_unit,
          unit_price:
            type === 'sale'
              ? (found.selling_price / 100).toFixed(2)
              : (found.purchase_price / 100).toFixed(2),
        }
      } else {
        copy[idx] = { ...copy[idx], product_id: '', unit: '', unit_price: '' }
      }
      return copy
    })
  }

  const handleItemChange = (idx, field, val) => {
    setItems((prev) => {
      const copy = [...prev]
      copy[idx] = { ...copy[idx], [field]: val }
      return copy
    })
  }

  const addItemRow = () => {
    setItems((prev) => [...prev, { product_id: '', quantity: '1', unit: '', unit_price: '' }])
  }

  const removeItemRow = (idx) => {
    if (items.length <= 1) return
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setApiError(null)

    const valResult = validateTransactionDraft({ type, items })
    if (!valResult.isValid) {
      setErrors(valResult.errors)
      return
    }

    setSubmitting(true)
    const payload = {
      type,
      original_instruction: instruction.trim(),
      items: items.map((it) => ({
        product_id: parseInt(it.product_id, 10),
        quantity: qtyToMilli(it.quantity),
        unit: it.unit.trim(),
        unit_price: rupeesToPaise(it.unit_price),
      })),
    }

    api
      .createTransactionDraft(payload)
      .then((draft) => onSuccess(draft))
      .catch((err) => {
        setApiError(err.message || 'Failed to create transaction draft.')
        setSubmitting(false)
      })
  }

  // Estimated preview total in rupees
  const estimatedTotal = items.reduce((sum, it) => {
    const q = parseFloat(it.quantity) || 0
    const p = parseFloat(it.unit_price) || 0
    return sum + q * p
  }, 0)

  return (
    <div className="modal-backdrop">
      <div className="modal-content modal-wide">
        <div className="modal-header">
          <h3>Create {type === 'sale' ? 'Sale' : 'Purchase'} Draft</h3>
          <button type="button" className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        {apiError && <div className="alert-banner alert-danger">{apiError}</div>}
        {errors.general && <div className="alert-banner alert-danger">{errors.general}</div>}

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-row">
            <div className="form-group flex-1">
              <label>Transaction Type *</label>
              <div className="type-toggle-group">
                <button
                  type="button"
                  className={`btn-type-toggle ${type === 'sale' ? 'active-sale' : ''}`}
                  onClick={() => setType('sale')}
                >
                  Sale (Customer Order)
                </button>
                <button
                  type="button"
                  className={`btn-type-toggle ${type === 'purchase' ? 'active-purchase' : ''}`}
                  onClick={() => setType('purchase')}
                >
                  Purchase (Vendor Stock In)
                </button>
              </div>
            </div>

            <div className="form-group flex-2">
              <label>Shopkeeper Note / Original Instruction</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Ramesh Patel order via counter"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
              />
            </div>
          </div>

          <div className="draft-items-section">
            <div className="draft-items-header">
              <h4>Line Items</h4>
              <span className="field-help">
                Drafts validate products and conversion rules without altering inventory yet.
              </span>
            </div>

            {items.map((it, idx) => {
              const itemErr = errors.items?.[idx] || {}
              const lineEstimate = (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0)

              return (
                <div key={idx} className="draft-item-card">
                  <div className="draft-item-grid">
                    <div className="form-group flex-2">
                      <label>Product *</label>
                      <select
                        className={`form-input ${itemErr.product_id ? 'input-error' : ''}`}
                        value={it.product_id}
                        disabled={loadingProducts}
                        onChange={(e) => handleProductSelect(idx, e.target.value)}
                      >
                        <option value="">-- Choose product --</option>
                        {availableProducts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.sku}) — Stock: {milliToQty(p.stock_qty)} {p.base_unit}
                          </option>
                        ))}
                      </select>
                      {itemErr.product_id && (
                        <span className="field-error">{itemErr.product_id}</span>
                      )}
                    </div>

                    <div className="form-group flex-1">
                      <label>Quantity *</label>
                      <input
                        type="number"
                        step="any"
                        min="0.001"
                        className={`form-input ${itemErr.quantity ? 'input-error' : ''}`}
                        value={it.quantity}
                        onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                      />
                      {itemErr.quantity && (
                        <span className="field-error">{itemErr.quantity}</span>
                      )}
                    </div>

                    <div className="form-group flex-1">
                      <label>Unit *</label>
                      <input
                        type="text"
                        className={`form-input ${itemErr.unit ? 'input-error' : ''}`}
                        placeholder="kg, box..."
                        value={it.unit}
                        onChange={(e) => handleItemChange(idx, 'unit', e.target.value)}
                      />
                      {itemErr.unit && <span className="field-error">{itemErr.unit}</span>}
                    </div>

                    <div className="form-group flex-1">
                      <label>Unit Price (₹) *</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className={`form-input ${itemErr.unit_price ? 'input-error' : ''}`}
                        value={it.unit_price}
                        onChange={(e) => handleItemChange(idx, 'unit_price', e.target.value)}
                      />
                      {itemErr.unit_price && (
                        <span className="field-error">{itemErr.unit_price}</span>
                      )}
                    </div>

                    <div className="form-group flex-1 line-total-preview">
                      <label>Line Total (₹)</label>
                      <span className="preview-val">₹{lineEstimate.toFixed(2)}</span>
                    </div>

                    {items.length > 1 && (
                      <button
                        type="button"
                        className="btn-remove-line"
                        title="Remove item"
                        onClick={() => removeItemRow(idx)}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              )
            })}

            <button type="button" className="btn btn-outline btn-sm" onClick={addItemRow}>
              + Add Another Item
            </button>
          </div>

          <div className="draft-summary-bar">
            <span>Estimated Total:</span>
            <span className="summary-total-val">₹{estimatedTotal.toFixed(2)}</span>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-outline"
              disabled={submitting}
              onClick={onClose}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Creating Draft…' : 'Save as Draft →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function TransactionReviewModal({ transaction, onClose, onConfirm }) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState(null)

  const handleConfirmClick = () => {
    setConfirming(true)
    setError(null)
    api
      .confirmTransaction(transaction.id)
      .then((confirmed) => onConfirm(confirmed))
      .catch((err) => {
        setError(err.message || 'Confirmation failed.')
        setConfirming(false)
      })
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-content modal-wide">
        <div className="modal-header">
          <div>
            <h3>Review Draft #{transaction.id}</h3>
            <span className="modal-subtitle">
              Verify line items and quantities before atomic inventory confirmation.
            </span>
          </div>
          <button type="button" className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        {error && <div className="alert-banner alert-danger">{error}</div>}

        <div className="modal-body">
          <div className="review-meta-bar">
            <div>
              <span className="stat-label">Type:</span>{' '}
              <span className={`badge badge-${formatTransactionType(transaction.type).tone}`}>
                {transaction.type.toUpperCase()}
              </span>
            </div>
            <div>
              <span className="stat-label">Status:</span>{' '}
              <span className="badge badge-warning">DRAFT (No stock changed)</span>
            </div>
            <div>
              <span className="stat-label">Date:</span>{' '}
              <span>{new Date(transaction.created_at).toLocaleString()}</span>
            </div>
          </div>

          <div className="table-container" style={{ margin: 'var(--space-md) 0' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Quantity</th>
                  <th>Unit</th>
                  <th>Base Equivalent</th>
                  <th>Unit Price</th>
                  <th>Line Total</th>
                </tr>
              </thead>
              <tbody>
                {transaction.items.map((it) => (
                  <tr key={it.id}>
                    <td>
                      <span className="product-name">{it.product_name}</span>
                      <span className="product-sku">{it.product_sku}</span>
                    </td>
                    <td>{milliToQty(it.quantity)}</td>
                    <td>{it.unit}</td>
                    <td>
                      {milliToQty(it.base_quantity)} {it.base_unit}
                    </td>
                    <td>{paiseToRupees(it.unit_price)}</td>
                    <td className="selling-price">{paiseToRupees(it.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="authoritative-total-box">
            <span>Authoritative Backend Total:</span>
            <span className="auth-total-val">{paiseToRupees(transaction.total_amount)}</span>
          </div>

          <div className="confirm-notice-banner">
            <p>
              ⚠️ <strong>Confirmation action:</strong> Clicking &quot;Confirm &amp; Update Inventory&quot;
              will atomically deduct (or add) stock in SQLite and record auditable movement logs.
              This cannot be undone without a formal reversal.
            </p>
          </div>
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-outline"
            disabled={confirming}
            onClick={onClose}
          >
            Keep as Draft
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={confirming}
            onClick={handleConfirmClick}
          >
            {confirming ? 'Posting Inventory…' : 'Confirm & Update Inventory ✔'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TransactionDetailModal({ transactionId, onClose, onConfirm, onReverse }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadDetail = () => {
    setLoading(true)
    api
      .getTransaction(transactionId)
      .then((data) => {
        setDetail(data)
        setError(null)
      })
      .catch((err) => {
        setError(err.message || 'Failed to load transaction details.')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let ignore = false
    api
      .getTransaction(transactionId)
      .then((data) => {
        if (!ignore) {
          setDetail(data)
          setError(null)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!ignore) {
          setError(err.message || 'Failed to load transaction details.')
          setLoading(false)
        }
      })
    return () => {
      ignore = true
    }
  }, [transactionId])

  return (
    <div className="modal-backdrop">
      <div className="modal-content modal-wide">
        <div className="modal-header">
          <div>
            <h3>Transaction #{transactionId}</h3>
            {detail && (
              <span className="modal-subtitle">
                {detail.type.toUpperCase()} • {detail.status.toUpperCase()}
              </span>
            )}
          </div>
          <button type="button" className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        {loading ? (
          <div className="modal-loading">
            <div className="spinner" />
            <p>Loading transaction details…</p>
          </div>
        ) : error ? (
          <div className="modal-error">
            <p>{error}</p>
            <button type="button" className="btn btn-outline" onClick={loadDetail}>
              Retry
            </button>
          </div>
        ) : detail ? (
          <div className="modal-body">
            <div className="detail-grid">
              <div className="detail-stat">
                <span className="stat-label">Total Amount</span>
                <span className="stat-val selling-price">
                  {paiseToRupees(detail.total_amount)}
                </span>
                <span className="stat-sub">{detail.total_items} items</span>
              </div>

              <div className="detail-stat">
                <span className="stat-label">Type & Status</span>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <span className={`badge badge-${formatTransactionType(detail.type).tone}`}>
                    {detail.type}
                  </span>
                  <span className={`badge badge-${formatTransactionStatus(detail.status).tone}`}>
                    {detail.status}
                  </span>
                </div>
              </div>

              <div className="detail-stat">
                <span className="stat-label">Created At</span>
                <span className="stat-sub" style={{ marginTop: 6, color: 'var(--text-primary)' }}>
                  {new Date(detail.created_at).toLocaleString()}
                </span>
              </div>

              <div className="detail-stat">
                <span className="stat-label">Confirmed At</span>
                <span className="stat-sub" style={{ marginTop: 6, color: 'var(--text-primary)' }}>
                  {detail.confirmed_at ? new Date(detail.confirmed_at).toLocaleString() : 'Unconfirmed'}
                </span>
              </div>
            </div>

            {detail.original_instruction && (
              <div className="meta-box" style={{ margin: 'var(--space-md) 0' }}>
                <span className="meta-k">Shopkeeper Note / Instruction:</span>
                <p className="meta-v" style={{ marginTop: 4 }}>
                  {detail.original_instruction}
                </p>
              </div>
            )}

            {/* Line items table */}
            <div className="conversions-section">
              <h4>Line Items</h4>
              <div className="table-container" style={{ margin: 'var(--space-sm) 0' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Quantity</th>
                      <th>Unit</th>
                      <th>Base Equivalent</th>
                      <th>Unit Price</th>
                      <th>Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((it) => (
                      <tr key={it.id}>
                        <td>
                          <span className="product-name">{it.product_name}</span>
                          <span className="product-sku">{it.product_sku}</span>
                        </td>
                        <td>{milliToQty(it.quantity)}</td>
                        <td>{it.unit}</td>
                        <td>
                          {milliToQty(it.base_quantity)} {it.base_unit}
                        </td>
                        <td>{paiseToRupees(it.unit_price)}</td>
                        <td className="selling-price">{paiseToRupees(it.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Auditable Movements table */}
            {detail.movements && detail.movements.length > 0 && (
              <div className="conversions-section">
                <h4>Auditable Inventory Movements</h4>
                <div className="table-container" style={{ margin: 'var(--space-sm) 0' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Movement Type</th>
                        <th>Product</th>
                        <th>Qty Change</th>
                        <th>Stock Before</th>
                        <th>Stock After</th>
                        <th>Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.movements.map((mov) => (
                        <tr key={mov.id}>
                          <td>
                            <span
                              className={`badge ${
                                mov.movement_type === 'reversal'
                                  ? 'badge-danger'
                                  : mov.movement_type === 'sale'
                                  ? 'badge-warning'
                                  : 'badge-success'
                              }`}
                            >
                              {mov.movement_type}
                            </span>
                          </td>
                          <td>{mov.product_name || `Product #${mov.product_id}`}</td>
                          <td style={{ fontWeight: 600 }}>
                            {mov.quantity_change > 0 ? '+' : ''}
                            {milliToQty(mov.quantity_change)}
                          </td>
                          <td>{milliToQty(mov.stock_before)}</td>
                          <td style={{ fontWeight: 600 }}>{milliToQty(mov.stock_after)}</td>
                          <td>{new Date(mov.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : null}

        <div className="modal-actions">
          {detail?.status === 'draft' && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                onClose()
                onConfirm(detail)
              }}
            >
              Confirm Transaction
            </button>
          )}
          {detail?.status === 'confirmed' && (
            <button
              type="button"
              className="btn btn-action-danger"
              style={{ padding: '8px 16px' }}
              onClick={() => {
                onClose()
                onReverse(detail)
              }}
            >
              Reverse Transaction
            </button>
          )}
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function TransactionReverseModal({ transaction, onClose, onConfirm }) {
  return (
    <div className="modal-backdrop">
      <div className="modal-content modal-sm">
        <div className="modal-header">
          <h3>Reverse Transaction #{transaction.id}</h3>
          <button type="button" className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <p>
            Are you sure you want to reverse this <strong>{transaction.type}</strong> of{' '}
            <strong>{paiseToRupees(transaction.total_amount)}</strong>?
          </p>
          <p className="field-help warning-text">
            Reversing will post compensating inventory movement records and restore original
            stock. The original transaction is never deleted and remains permanently audited.
          </p>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-accent btn-danger-tone"
            onClick={onConfirm}
          >
            Yes, Reverse
          </button>
        </div>
      </div>
    </div>
  )
}
