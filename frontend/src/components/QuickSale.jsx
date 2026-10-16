import { useEffect, useRef, useState } from 'react'
import { api } from '../services/api'
import { useI18n } from '../i18n/I18nContext'
import {
  milliToQty,
  paiseToRupees,
  qtyToMilli,
  rupeesToPaise,
} from '../utils/formatters'
import { ReceiptModal } from './ReceiptModal'

export function QuickSale() {
  const { t } = useI18n()

  // Product search
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const searchInputRef = useRef(null)

  // Cart
  const [cart, setCart] = useState([])
  const [paymentMethod, setPaymentMethod] = useState('cash') // 'cash' | 'upi' | 'credit'
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [customers, setCustomers] = useState([])

  // Workflow states
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [confirmedTx, setConfirmedTx] = useState(null)
  const [showReceipt, setShowReceipt] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  // Quick Add Product inline modal
  const [quickAddModal, setQuickAddModal] = useState(false)
  const [quickProdData, setQuickProdData] = useState({
    name: '',
    selling_price: '',
    opening_stock: '10',
    base_unit: 'piece',
  })
  const [quickProdSubmitting, setQuickProdSubmitting] = useState(false)

  // Load active customers for Udhaar
  const loadCustomers = () => {
    api
      .getCustomers({ active: true, limit: 100 })
      .then((data) => setCustomers(data.items || []))
      .catch(() => {})
  }

  useEffect(() => {
    loadCustomers()
  }, [])

  // Live product search
  useEffect(() => {
    if (!query.trim()) {
      return
    }

    let ignore = false
    const timer = setTimeout(() => {
      setIsSearching(true)
      api
        .getProducts({ query: query.trim(), active: true, limit: 8 })
        .then((res) => {
          if (!ignore) {
            setSearchResults(res.items || [])
          }
        })
        .catch(() => {
          if (!ignore) {
            setSearchResults([])
          }
        })
        .finally(() => {
          if (!ignore) {
            setIsSearching(false)
          }
        })
    }, 200)

    return () => {
      ignore = true
      clearTimeout(timer)
    }
  }, [query])

  const visibleSearchResults = query.trim() ? searchResults : []


  // Cart actions
  const addToCart = (product) => {
    setCart((prev) => {
      const existingIdx = prev.findIndex((item) => item.product_id === product.id)
      if (existingIdx >= 0) {
        // Increment quantity by 1 unit (1000 milli-units)
        const updated = [...prev]
        const curr = updated[existingIdx]
        const newQty = curr.quantity + 1000
        const newLineTotal = Math.floor((newQty * curr.unit_price) / 1000)
        updated[existingIdx] = {
          ...curr,
          quantity: newQty,
          line_total: newLineTotal,
        }
        return updated
      } else {
        const qtyMilli = 1000
        const lineTotal = Math.floor((qtyMilli * product.selling_price) / 1000)
        return [
          ...prev,
          {
            product_id: product.id,
            product_name: product.name,
            sku: product.sku,
            unit: product.base_unit,
            base_unit: product.base_unit,
            unit_price: product.selling_price, // in paise
            quantity: qtyMilli, // in milli-units
            stock_qty: product.stock_qty,
            line_total: lineTotal,
          },
        ]
      }
    })
    setQuery('')
    setSearchResults([])
    if (searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }

  const updateQuantity = (index, deltaMilli) => {
    setCart((prev) => {
      const updated = [...prev]
      const curr = updated[index]
      const newQty = Math.max(0, curr.quantity + deltaMilli)
      if (newQty === 0) {
        return updated.filter((_, i) => i !== index)
      }
      const newLineTotal = Math.floor((newQty * curr.unit_price) / 1000)
      updated[index] = { ...curr, quantity: newQty, line_total: newLineTotal }
      return updated
    })
  }

  const setDirectQuantity = (index, qtyStr) => {
    const milli = qtyToMilli(qtyStr)
    setCart((prev) => {
      const updated = [...prev]
      const curr = updated[index]
      if (milli <= 0) {
        return updated.filter((_, i) => i !== index)
      }
      const newLineTotal = Math.floor((milli * curr.unit_price) / 1000)
      updated[index] = { ...curr, quantity: milli, line_total: newLineTotal }
      return updated
    })
  }

  const setDirectPrice = (index, priceRupeesStr) => {
    const paise = rupeesToPaise(priceRupeesStr)
    setCart((prev) => {
      const updated = [...prev]
      const curr = updated[index]
      const newLineTotal = Math.floor((curr.quantity * paise) / 1000)
      updated[index] = { ...curr, unit_price: paise, line_total: newLineTotal }
      return updated
    })
  }

  const removeFromCart = (index) => {
    setCart((prev) => prev.filter((_, i) => i !== index))
  }

  const clearCart = () => {
    setCart([])
    setConfirmedTx(null)
    setError(null)
    setNotice(null)
  }

  // Totals in integer paise
  const cartTotalPaise = cart.reduce((sum, item) => sum + item.line_total, 0)
  const totalItemsCount = cart.length

  // Quick sale review and confirmation
  const handleProceedToReview = () => {
    setError(null)
    if (cart.length === 0) {
      setError(t('quick_sale.cart_empty'))
      return
    }
    if (paymentMethod === 'credit' && !selectedCustomerId) {
      setError(t('quick_sale.customer_required'))
      return
    }
    setReviewModalOpen(true)
  }

  const handleConfirmSale = async () => {
    setIsSubmitting(true)
    setError(null)
    try {
      const payload = {
        type: 'sale',
        payment_method: paymentMethod,
        customer_id: paymentMethod === 'credit' ? Number(selectedCustomerId) : null,
        original_instruction: `Quick POS Sale (${paymentMethod.toUpperCase()})`,
        items: cart.map((it) => ({
          product_id: it.product_id,
          quantity: it.quantity,
          unit: it.unit,
          unit_price: it.unit_price,
        })),
      }

      // Step 1: Create draft
      const draft = await api.createTransactionDraft(payload)
      // Step 2: Confirm atomically
      const confirmed = await api.confirmTransaction(draft.id)

      setConfirmedTx(confirmed)
      setReviewModalOpen(false)
      setCart([])
      setShowReceipt(true)
      setNotice(t('quick_sale.sale_success'))
      // Refresh customer list to update balances
      loadCustomers()
    } catch (err) {
      setError(err.message || 'Failed to complete transaction.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Quick product add
  const handleQuickAddProduct = async (e) => {
    e.preventDefault()
    if (!quickProdData.name.trim()) return
    setQuickProdSubmitting(true)
    try {
      const created = await api.createProduct({
        name: quickProdData.name.trim(),
        selling_price: rupeesToPaise(quickProdData.selling_price || '0'),
        purchase_price: 0,
        base_unit: quickProdData.base_unit || 'piece',
        opening_stock: qtyToMilli(quickProdData.opening_stock || '0'),
        low_stock_threshold: 5000,
      })
      setQuickAddModal(false)
      setQuickProdData({ name: '', selling_price: '', opening_stock: '10', base_unit: 'piece' })
      addToCart(created)
      setNotice(`"${created.name}" added to catalog and cart!`)
    } catch (err) {
      setError(err.message || 'Failed to add quick product.')
    } finally {
      setQuickProdSubmitting(false)
    }
  }

  const isWeightUnit = (unit) => ['kg', 'g', 'gram', 'kilogram'].includes(unit.toLowerCase())

  return (
    <div className="quick-sale-view">
      {/* Top Header */}
      <div className="quick-sale-header">
        <div>
          <h2>⚡ {t('quick_sale.title')}</h2>
          <p className="quick-sale-sub">{t('quick_sale.subtitle')}</p>
        </div>
        <div className="quick-sale-actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setQuickAddModal(true)}
          >
            {t('quick_sale.add_custom')}
          </button>
          {cart.length > 0 && (
            <button type="button" className="btn btn-outline text-danger" onClick={clearCart}>
              {t('common.clear')}
            </button>
          )}
        </div>
      </div>

      {notice && <div className="alert alert-success">{notice}</div>}
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="quick-sale-layout">
        {/* Left Column: Product Search & Cart */}
        <div className="quick-sale-main">
          {/* Instant Product Search Bar */}
          <div className="pos-search-wrapper">
            <input
              ref={searchInputRef}
              type="text"
              className="pos-search-input"
              placeholder={t('quick_sale.search_placeholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            {isSearching && <span className="pos-search-spinner" />}

            {/* Dropdown Results */}
            {visibleSearchResults.length > 0 && (
              <div className="pos-search-dropdown">
                {visibleSearchResults.map((p) => (
                  <div
                    key={p.id}
                    className="pos-dropdown-item"
                    onClick={() => addToCart(p)}
                  >
                    <div className="pos-item-info">
                      <strong>{p.name}</strong>
                      <span className="pos-item-stock">
                        Stock: {milliToQty(p.stock_qty)} {p.base_unit}
                      </span>
                    </div>
                    <div className="pos-item-price">
                      ₹{paiseToRupees(p.selling_price)} / {p.base_unit}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cart Table */}
          <div className="pos-cart-container card">
            <div className="pos-cart-header">
              <h3>
                🛒 {t('quick_sale.cart_title')} ({totalItemsCount})
              </h3>
            </div>

            {cart.length === 0 ? (
              <div className="pos-cart-empty">
                <p>{t('quick_sale.cart_empty')}</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table pos-table">
                  <thead>
                    <tr>
                      <th>{t('receipt.item')}</th>
                      <th style={{ width: '220px' }}>{t('quick_sale.qty')} & {t('quick_sale.shortcuts')}</th>
                      <th style={{ width: '120px' }}>{t('quick_sale.rate')} (₹)</th>
                      <th style={{ width: '120px' }}>{t('quick_sale.line_total')} (₹)</th>
                      <th style={{ width: '40px' }} />
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((item, idx) => (
                      <tr key={item.product_id}>
                        <td>
                          <strong>{item.product_name}</strong>
                          <div className="pos-item-sub">
                            Unit: {item.unit} | Stock: {milliToQty(item.stock_qty)}
                          </div>
                        </td>
                        <td>
                          <div className="pos-qty-row">
                            <input
                              type="number"
                              step="any"
                              className="form-control pos-qty-input"
                              value={milliToQty(item.quantity)}
                              onChange={(e) => setDirectQuantity(idx, e.target.value)}
                            />
                            <span className="pos-unit-label">{item.unit}</span>
                          </div>
                          {/* Unit-Aware Shortcuts */}
                          <div className="pos-shortcut-chips">
                            {isWeightUnit(item.unit) ? (
                              <>
                                <button
                                  type="button"
                                  className="chip-btn"
                                  onClick={() => updateQuantity(idx, 250)}
                                >
                                  +250g
                                </button>
                                <button
                                  type="button"
                                  className="chip-btn"
                                  onClick={() => updateQuantity(idx, 500)}
                                >
                                  +500g
                                </button>
                                <button
                                  type="button"
                                  className="chip-btn"
                                  onClick={() => updateQuantity(idx, 1000)}
                                >
                                  +1kg
                                </button>
                                <button
                                  type="button"
                                  className="chip-btn"
                                  onClick={() => updateQuantity(idx, 2000)}
                                >
                                  +2kg
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="chip-btn"
                                  onClick={() => updateQuantity(idx, 1000)}
                                >
                                  +1
                                </button>
                                <button
                                  type="button"
                                  className="chip-btn"
                                  onClick={() => updateQuantity(idx, 2000)}
                                >
                                  +2
                                </button>
                                <button
                                  type="button"
                                  className="chip-btn"
                                  onClick={() => updateQuantity(idx, 5000)}
                                >
                                  +5
                                </button>
                                <button
                                  type="button"
                                  className="chip-btn"
                                  onClick={() => updateQuantity(idx, 10000)}
                                >
                                  +10
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                        <td>
                          <input
                            type="number"
                            step="any"
                            className="form-control pos-price-input"
                            value={paiseToRupees(item.unit_price)}
                            onChange={(e) => setDirectPrice(idx, e.target.value)}
                          />
                        </td>
                        <td>
                          <span className="pos-line-total">
                            ₹{paiseToRupees(item.line_total)}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn-icon text-danger"
                            title="Remove"
                            onClick={() => removeFromCart(idx)}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Payment & Bill Summary */}
        <div className="quick-sale-sidebar">
          <div className="card pos-summary-card">
            <h3 className="card-title">🧾 {t('receipt.total')}</h3>

            <div className="pos-total-display">
              <span className="pos-total-label">{t('receipt.total')}</span>
              <span className="pos-total-amount">₹{paiseToRupees(cartTotalPaise)}</span>
            </div>

            <div className="pos-payment-section">
              <label className="form-label">{t('quick_sale.payment_method')}</label>
              <div className="pos-payment-options">
                <button
                  type="button"
                  className={`payment-option-btn ${paymentMethod === 'cash' ? 'active' : ''}`}
                  onClick={() => setPaymentMethod('cash')}
                >
                  💵 {t('quick_sale.payment_cash')}
                </button>
                <button
                  type="button"
                  className={`payment-option-btn ${paymentMethod === 'upi' ? 'active' : ''}`}
                  onClick={() => setPaymentMethod('upi')}
                >
                  📱 {t('quick_sale.payment_upi')}
                </button>
                <button
                  type="button"
                  className={`payment-option-btn ${paymentMethod === 'credit' ? 'active' : ''}`}
                  onClick={() => setPaymentMethod('credit')}
                >
                  📒 {t('quick_sale.payment_credit')}
                </button>
              </div>

              {/* UPI cashier disclaimer */}
              {paymentMethod === 'upi' && (
                <div className="alert alert-warning pos-upi-alert">
                  ⚠️ {t('quick_sale.upi_notice')}
                </div>
              )}

              {/* Customer Selector for Udhaar / Credit */}
              {paymentMethod === 'credit' && (
                <div className="pos-customer-select-wrapper">
                  <label className="form-label">{t('quick_sale.select_customer')} *</label>
                  <select
                    className="form-control"
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                  >
                    <option value="">{t('quick_sale.customer_placeholder')}</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.phone ? `(${c.phone})` : ''} — Bal: ₹{paiseToRupees(c.current_balance)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <button
              type="button"
              className="btn btn-primary pos-confirm-btn"
              disabled={cart.length === 0}
              onClick={handleProceedToReview}
            >
              {t('quick_sale.btn_proceed')} →
            </button>
          </div>
        </div>
      </div>

      {/* Review Before Confirmation Modal */}
      {reviewModalOpen && (
        <div className="modal-overlay" onClick={() => setReviewModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t('quick_sale.review_title')}</h3>
              <button
                type="button"
                className="close-button"
                onClick={() => setReviewModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <p className="placeholder-copy">{t('quick_sale.review_desc')}</p>

            <div className="table-responsive" style={{ maxHeight: '250px', margin: 'var(--space-md) 0' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('receipt.item')}</th>
                    <th>{t('quick_sale.qty')}</th>
                    <th>{t('quick_sale.rate')}</th>
                    <th>{t('receipt.amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((it) => (
                    <tr key={it.product_id}>
                      <td>{it.product_name}</td>
                      <td>
                        {milliToQty(it.quantity)} {it.unit}
                      </td>
                      <td>₹{paiseToRupees(it.unit_price)}</td>
                      <td>₹{paiseToRupees(it.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pos-review-summary">
              <div className="review-row">
                <span>{t('receipt.total')}:</span>
                <strong>₹{paiseToRupees(cartTotalPaise)}</strong>
              </div>
              <div className="review-row">
                <span>{t('quick_sale.payment_method')}:</span>
                <span className="badge badge-info">
                  {paymentMethod === 'cash' && `💵 ${t('quick_sale.payment_cash')}`}
                  {paymentMethod === 'upi' && `📱 ${t('quick_sale.payment_upi')}`}
                  {paymentMethod === 'credit' && `📒 ${t('quick_sale.payment_credit')}`}
                </span>
              </div>
              {paymentMethod === 'credit' && (
                <div className="review-row">
                  <span>{t('receipt.customer')}:</span>
                  <strong>
                    {customers.find((c) => String(c.id) === String(selectedCustomerId))?.name || '—'}
                  </strong>
                </div>
              )}
            </div>

            <div className="modal-actions" style={{ marginTop: 'var(--space-md)' }}>
              <button
                type="button"
                className="btn btn-outline"
                disabled={isSubmitting}
                onClick={() => setReviewModalOpen(false)}
              >
                {t('quick_sale.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={isSubmitting}
                onClick={handleConfirmSale}
              >
                {isSubmitting ? <span className="spinner" /> : t('quick_sale.confirm_btn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Product Modal */}
      {quickAddModal && (
        <div className="modal-overlay" onClick={() => setQuickAddModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t('quick_sale.add_custom')}</h3>
              <button type="button" className="close-button" onClick={() => setQuickAddModal(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleQuickAddProduct}>
              <div className="form-group">
                <label className="form-label">{t('products.field_name')} *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Parle-G 100g"
                  value={quickProdData.name}
                  onChange={(e) => setQuickProdData({ ...quickProdData, name: e.target.value })}
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t('products.field_selling_price')} (₹) *</label>
                  <input
                    type="number"
                    step="any"
                    className="form-control"
                    placeholder="10.00"
                    value={quickProdData.selling_price}
                    onChange={(e) =>
                      setQuickProdData({ ...quickProdData, selling_price: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('products.field_opening_stock')}</label>
                  <input
                    type="number"
                    step="any"
                    className="form-control"
                    value={quickProdData.opening_stock}
                    onChange={(e) =>
                      setQuickProdData({ ...quickProdData, opening_stock: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">{t('products.field_base_unit')}</label>
                <select
                  className="form-control"
                  value={quickProdData.base_unit}
                  onChange={(e) =>
                    setQuickProdData({ ...quickProdData, base_unit: e.target.value })
                  }
                >
                  <option value="piece">piece</option>
                  <option value="kg">kg</option>
                  <option value="g">g</option>
                  <option value="box">box</option>
                  <option value="pack">pack</option>
                </select>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setQuickAddModal(false)}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={quickProdSubmitting}
                >
                  {quickProdSubmitting ? <span className="spinner" /> : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Receipt Modal */}
      {showReceipt && confirmedTx && (
        <ReceiptModal
          transaction={confirmedTx}
          customer={customers.find((c) => c.id === confirmedTx.customer_id)}
          onClose={() => setShowReceipt(false)}
        />
      )}
    </div>
  )
}
