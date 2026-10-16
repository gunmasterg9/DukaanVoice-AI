import { useEffect, useState } from 'react'
import { api } from '../services/api'
import {
  milliToQty,
  paiseToRupees,
  qtyToMilli,
  rupeesToPaise,
  validateConversionForm,
  validateProductForm,
} from '../utils/formatters'

export function Products() {
  const [products, setProducts] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  // Filters
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [activeFilter, setActiveFilter] = useState('all') // 'all' | 'active' | 'inactive'
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [page, setPage] = useState(0)
  const pageSize = 15

  // Modals
  const [activeModal, setActiveModal] = useState(null) // null | { type: 'add' } | { type: 'edit', product } | { type: 'view', product } | { type: 'deactivate', product }

  // Search debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(0)
    }, 250)
    return () => clearTimeout(timer)
  }, [search])

  // Load products
  const fetchProducts = () => {
    setLoading(true)
    setError(null)

    const params = {
      limit: pageSize,
      offset: page * pageSize,
    }
    if (debouncedSearch.trim()) params.query = debouncedSearch.trim()
    if (categoryFilter.trim()) params.category = categoryFilter.trim()
    if (activeFilter === 'active') params.active = true
    if (activeFilter === 'inactive') params.active = false
    if (lowStockOnly) params.low_stock_only = true

    api
      .getProducts(params)
      .then((data) => {
        setProducts(data.items || [])
        setTotal(data.total || 0)
        setError(null)
      })
      .catch((err) => {
        setError(err.message || 'Unable to load products.')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let ignore = false
    const params = {
      limit: pageSize,
      offset: page * pageSize,
    }
    if (debouncedSearch.trim()) params.query = debouncedSearch.trim()
    if (categoryFilter.trim()) params.category = categoryFilter.trim()
    if (activeFilter === 'active') params.active = true
    if (activeFilter === 'inactive') params.active = false
    if (lowStockOnly) params.low_stock_only = true

    api
      .getProducts(params)
      .then((data) => {
        if (!ignore) {
          setProducts(data.items || [])
          setTotal(data.total || 0)
          setError(null)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!ignore) {
          setError(err.message || 'Unable to load products.')
          setLoading(false)
        }
      })

    return () => {
      ignore = true
    }
  }, [debouncedSearch, categoryFilter, activeFilter, lowStockOnly, page])

  const showNotice = (msg, tone = 'success') => {
    setNotice({ message: msg, tone })
    setTimeout(() => setNotice(null), 4000)
  }

  // Categories list extracted from loaded or current products
  const availableCategories = Array.from(
    new Set(products.map((p) => p.category).filter(Boolean))
  ).sort()

  const handleDeactivate = (product) => {
    api
      .deactivateProduct(product.id)
      .then(() => {
        showNotice(`Product "${product.name}" deactivated.`)
        setActiveModal(null)
        fetchProducts()
      })
      .catch((err) => {
        showNotice(err.message || 'Failed to deactivate product.', 'danger')
      })
  }

  const handleReactivate = (product) => {
    api
      .reactivateProduct(product.id)
      .then(() => {
        showNotice(`Product "${product.name}" reactivated.`)
        fetchProducts()
      })
      .catch((err) => {
        showNotice(err.message || 'Failed to reactivate product.', 'danger')
      })
  }

  return (
    <div className="products-view">
      {/* Top Header */}
      <div className="section-header">
        <div>
          <h2>Product Register</h2>
          <p className="subtitle">
            Manage your shop inventory, standard units, prices, and conversion rules.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setActiveModal({ type: 'add' })}
        >
          + Add New Product
        </button>
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

      {/* Filter and Search Bar */}
      <div className="toolbar-card">
        <div className="toolbar-search">
          <input
            type="text"
            className="form-input search-input"
            placeholder="Search by name or SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => setSearch('')}
            >
              ×
            </button>
          )}
        </div>

        <div className="toolbar-filters">
          <select
            className="form-input filter-select"
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value)
              setPage(0)
            }}
          >
            <option value="">All Categories</option>
            {availableCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            className="form-input filter-select"
            value={activeFilter}
            onChange={(e) => {
              setActiveFilter(e.target.value)
              setPage(0)
            }}
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>

          <label className="toggle-label">
            <input
              type="checkbox"
              checked={lowStockOnly}
              onChange={(e) => {
                setLowStockOnly(e.target.checked)
                setPage(0)
              }}
            />
            <span>Low Stock Alert</span>
          </label>
        </div>
      </div>

      {/* Product Table / Content */}
      <div className="card table-card">
        {loading ? (
          <div className="table-loading">
            <div className="spinner" />
            <p>Loading inventory…</p>
          </div>
        ) : error ? (
          <div className="table-error">
            <p>{error}</p>
            <button type="button" className="btn btn-outline" onClick={fetchProducts}>
              Retry
            </button>
          </div>
        ) : products.length === 0 ? (
          <div className="table-empty">
            <div className="empty-icon">📦</div>
            <h3>No products found</h3>
            <p>
              {search || categoryFilter || lowStockOnly || activeFilter !== 'all'
                ? 'Try adjusting your search query or filters.'
                : 'Your shop register is empty. Add your first product to begin.'}
            </p>
            {!search && !categoryFilter && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setActiveModal({ type: 'add' })}
              >
                + Add First Product
              </button>
            )}
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product & SKU</th>
                  <th>Category</th>
                  <th>Current Stock</th>
                  <th>Base Unit</th>
                  <th>Purchase Price</th>
                  <th>Selling Price</th>
                  <th>Status</th>
                  <th className="th-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className={!p.active ? 'row-inactive' : ''}>
                    <td>
                      <div className="product-title-cell">
                        <span className="product-name">{p.name}</span>
                        <span className="product-sku">{p.sku}</span>
                      </div>
                    </td>
                    <td>
                      <span className="category-pill">{p.category || '—'}</span>
                    </td>
                    <td>
                      <div className="stock-cell">
                        <span className="stock-value">{milliToQty(p.stock_qty)}</span>
                        {p.is_low_stock && (
                          <span
                            className="badge badge-warning"
                            title={`Low stock alert! Threshold: ${milliToQty(p.low_stock_threshold)}`}
                          >
                            Low Stock
                          </span>
                        )}
                      </div>
                    </td>
                    <td>{p.base_unit}</td>
                    <td>{paiseToRupees(p.purchase_price)}</td>
                    <td className="selling-price">{paiseToRupees(p.selling_price)}</td>
                    <td>
                      {p.active ? (
                        <span className="badge badge-success">Active</span>
                      ) : (
                        <span className="badge badge-danger">Inactive</span>
                      )}
                    </td>
                    <td className="td-actions">
                      <button
                        type="button"
                        className="btn-action"
                        title="View details & conversions"
                        onClick={() => setActiveModal({ type: 'view', product: p })}
                      >
                        View
                      </button>
                      <button
                        type="button"
                        className="btn-action"
                        title="Edit details"
                        onClick={() => setActiveModal({ type: 'edit', product: p })}
                      >
                        Edit
                      </button>
                      {p.active ? (
                        <button
                          type="button"
                          className="btn-action btn-action-danger"
                          title="Deactivate product"
                          onClick={() => setActiveModal({ type: 'deactivate', product: p })}
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-action btn-action-success"
                          title="Reactivate product"
                          onClick={() => handleReactivate(p)}
                        >
                          Reactivate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {total > pageSize && (
          <div className="pagination-bar">
            <span>
              Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total} products
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
      {activeModal?.type === 'add' && (
        <ProductFormModal
          mode="add"
          onClose={() => setActiveModal(null)}
          onSuccess={(saved) => {
            showNotice(`Product "${saved.name}" added successfully.`)
            setActiveModal(null)
            fetchProducts()
          }}
        />
      )}

      {activeModal?.type === 'edit' && (
        <ProductFormModal
          mode="edit"
          product={activeModal.product}
          onClose={() => setActiveModal(null)}
          onSuccess={(saved) => {
            showNotice(`Product "${saved.name}" updated successfully.`)
            setActiveModal(null)
            fetchProducts()
          }}
        />
      )}

      {activeModal?.type === 'view' && (
        <ProductDetailModal
          productId={activeModal.product.id}
          onClose={() => setActiveModal(null)}
          onEdit={() => setActiveModal({ type: 'edit', product: activeModal.product })}
        />
      )}

      {activeModal?.type === 'deactivate' && (
        <DeactivateConfirmModal
          product={activeModal.product}
          onClose={() => setActiveModal(null)}
          onConfirm={() => handleDeactivate(activeModal.product)}
        />
      )}
    </div>
  )
}

function ProductFormModal({ mode, product, onClose, onSuccess }) {
  const isEdit = mode === 'edit'
  const [formData, setFormData] = useState({
    name: product?.name || '',
    sku: product?.sku || '',
    category: product?.category || '',
    base_unit: product?.base_unit || 'kg',
    opening_stock: product ? milliToQty(product.stock_qty) : '0',
    purchase_price: product ? (product.purchase_price / 100).toFixed(2) : '0.00',
    selling_price: product ? (product.selling_price / 100).toFixed(2) : '0.00',
    low_stock_threshold: product ? milliToQty(product.low_stock_threshold) : '5',
  })
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [apiError, setApiError] = useState(null)

  const handleChange = (field, val) => {
    setFormData((prev) => ({ ...prev, [field]: val }))
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setApiError(null)

    const valResult = validateProductForm(formData)
    if (!valResult.isValid) {
      setErrors(valResult.errors)
      return
    }

    setSubmitting(true)

    if (isEdit) {
      const payload = {
        name: formData.name.trim(),
        sku: formData.sku.trim(),
        category: formData.category.trim(),
        base_unit: formData.base_unit.trim(),
        purchase_price: rupeesToPaise(formData.purchase_price),
        selling_price: rupeesToPaise(formData.selling_price),
        low_stock_threshold: qtyToMilli(formData.low_stock_threshold),
      }
      api
        .updateProduct(product.id, payload)
        .then((saved) => onSuccess(saved))
        .catch((err) => {
          setApiError(err.message || 'Failed to update product.')
          setSubmitting(false)
        })
    } else {
      const payload = {
        name: formData.name.trim(),
        sku: formData.sku.trim(),
        category: formData.category.trim(),
        base_unit: formData.base_unit.trim(),
        opening_stock: qtyToMilli(formData.opening_stock),
        purchase_price: rupeesToPaise(formData.purchase_price),
        selling_price: rupeesToPaise(formData.selling_price),
        low_stock_threshold: qtyToMilli(formData.low_stock_threshold),
      }
      api
        .createProduct(payload)
        .then((saved) => onSuccess(saved))
        .catch((err) => {
          setApiError(err.message || 'Failed to create product.')
          setSubmitting(false)
        })
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <div className="modal-header">
          <h3>{isEdit ? 'Edit Product' : 'Add New Product'}</h3>
          <button type="button" className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        {apiError && <div className="alert-banner alert-danger">{apiError}</div>}

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-row">
            <div className="form-group flex-2">
              <label>Product Name *</label>
              <input
                type="text"
                className={`form-input ${errors.name ? 'input-error' : ''}`}
                placeholder="e.g. Basmati Rice 1kg"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
              />
              {errors.name && <span className="field-error">{errors.name}</span>}
            </div>

            <div className="form-group flex-1">
              <label>SKU Code *</label>
              <input
                type="text"
                className={`form-input ${errors.sku ? 'input-error' : ''}`}
                placeholder="e.g. SKU-RICE-01"
                value={formData.sku}
                onChange={(e) => handleChange('sku', e.target.value)}
              />
              {errors.sku && <span className="field-error">{errors.sku}</span>}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group flex-1">
              <label>Category</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Grains, Spices, Dairy"
                value={formData.category}
                onChange={(e) => handleChange('category', e.target.value)}
              />
            </div>

            <div className="form-group flex-1">
              <label>Base Inventory Unit *</label>
              <input
                type="text"
                className={`form-input ${errors.base_unit ? 'input-error' : ''}`}
                placeholder="e.g. kg, packet, piece, liter"
                value={formData.base_unit}
                onChange={(e) => handleChange('base_unit', e.target.value)}
              />
              {errors.base_unit && <span className="field-error">{errors.base_unit}</span>}
            </div>
          </div>

          {!isEdit && (
            <div className="form-group">
              <label>Opening Stock ({formData.base_unit || 'units'})</label>
              <input
                type="number"
                step="any"
                min="0"
                className={`form-input ${errors.opening_stock ? 'input-error' : ''}`}
                value={formData.opening_stock}
                onChange={(e) => handleChange('opening_stock', e.target.value)}
              />
              <span className="field-help">
                Opening stock creates an auditable initial stock adjustment.
              </span>
              {errors.opening_stock && (
                <span className="field-error">{errors.opening_stock}</span>
              )}
            </div>
          )}

          <div className="form-row">
            <div className="form-group flex-1">
              <label>Purchase Price (₹)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className={`form-input ${errors.purchase_price ? 'input-error' : ''}`}
                value={formData.purchase_price}
                onChange={(e) => handleChange('purchase_price', e.target.value)}
              />
              {errors.purchase_price && (
                <span className="field-error">{errors.purchase_price}</span>
              )}
            </div>

            <div className="form-group flex-1">
              <label>Selling Price (₹)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className={`form-input ${errors.selling_price ? 'input-error' : ''}`}
                value={formData.selling_price}
                onChange={(e) => handleChange('selling_price', e.target.value)}
              />
              {errors.selling_price && (
                <span className="field-error">{errors.selling_price}</span>
              )}
            </div>

            <div className="form-group flex-1">
              <label>Low Stock Alert ({formData.base_unit || 'units'})</label>
              <input
                type="number"
                step="any"
                min="0"
                className={`form-input ${errors.low_stock_threshold ? 'input-error' : ''}`}
                value={formData.low_stock_threshold}
                onChange={(e) => handleChange('low_stock_threshold', e.target.value)}
              />
              {errors.low_stock_threshold && (
                <span className="field-error">{errors.low_stock_threshold}</span>
              )}
            </div>
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
              {submitting ? 'Saving…' : isEdit ? 'Update Product' : 'Create Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ProductDetailModal({ productId, onClose, onEdit }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Unit conversion add form state
  const [convForm, setConvForm] = useState({
    from_unit: '',
    to_unit: '',
    factor: '',
  })
  const [convErrors, setConvErrors] = useState({})
  const [convSubmitting, setConvSubmitting] = useState(false)
  const [convNotice, setConvNotice] = useState(null)

  const loadDetail = () => {
    setLoading(true)
    api
      .getProduct(productId)
      .then((data) => {
        setDetail(data)
        setConvForm((prev) => ({
          ...prev,
          to_unit: data.base_unit || '',
        }))
        setError(null)
      })
      .catch((err) => {
        setError(err.message || 'Failed to load product details.')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let ignore = false
    api
      .getProduct(productId)
      .then((data) => {
        if (!ignore) {
          setDetail(data)
          setConvForm((prev) => ({
            ...prev,
            to_unit: data.base_unit || '',
          }))
          setError(null)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!ignore) {
          setError(err.message || 'Failed to load product details.')
          setLoading(false)
        }
      })
    return () => {
      ignore = true
    }
  }, [productId])

  const handleAddConversion = (e) => {
    e.preventDefault()
    const valResult = validateConversionForm(convForm)
    if (!valResult.isValid) {
      setConvErrors(valResult.errors)
      return
    }

    setConvSubmitting(true)
    setConvNotice(null)

    const payload = {
      from_unit: convForm.from_unit.trim(),
      to_unit: convForm.to_unit.trim(),
      factor: qtyToMilli(convForm.factor),
    }

    api
      .createConversion(productId, payload)
      .then(() => {
        setConvNotice({ tone: 'success', text: 'Conversion rule added.' })
        setConvForm({
          from_unit: '',
          to_unit: detail?.base_unit || '',
          factor: '',
        })
        setConvErrors({})
        loadDetail()
      })
      .catch((err) => {
        setConvNotice({ tone: 'danger', text: err.message || 'Failed to add rule.' })
      })
      .finally(() => setConvSubmitting(false))
  }

  const handleDeleteConversion = (conversionId) => {
    api
      .deleteConversion(productId, conversionId)
      .then(() => {
        setConvNotice({ tone: 'success', text: 'Conversion rule removed.' })
        loadDetail()
      })
      .catch((err) => {
        setConvNotice({ tone: 'danger', text: err.message || 'Failed to delete rule.' })
      })
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-content modal-wide">
        <div className="modal-header">
          <div>
            <h3>Product Details</h3>
            {detail && <span className="modal-subtitle">{detail.name} ({detail.sku})</span>}
          </div>
          <button type="button" className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        {loading ? (
          <div className="modal-loading">
            <div className="spinner" />
            <p>Loading details…</p>
          </div>
        ) : error ? (
          <div className="modal-error">
            <p>{error}</p>
            <button type="button" className="btn btn-outline" onClick={loadDetail}>
              Retry
            </button>
          </div>
        ) : detail ? (
          <div className="detail-layout">
            {/* Overview Stats */}
            <div className="detail-grid">
              <div className="detail-stat">
                <span className="stat-label">Current Stock</span>
                <span className="stat-val">
                  {milliToQty(detail.stock_qty)} {detail.base_unit}
                </span>
                {detail.is_low_stock && (
                  <span className="badge badge-warning">Low Stock Alert</span>
                )}
              </div>

              <div className="detail-stat">
                <span className="stat-label">Selling Price</span>
                <span className="stat-val selling-price">
                  {paiseToRupees(detail.selling_price)}
                </span>
                <span className="stat-sub">per {detail.base_unit}</span>
              </div>

              <div className="detail-stat">
                <span className="stat-label">Purchase Price</span>
                <span className="stat-val">{paiseToRupees(detail.purchase_price)}</span>
                <span className="stat-sub">per {detail.base_unit}</span>
              </div>

              <div className="detail-stat">
                <span className="stat-label">Low Stock Threshold</span>
                <span className="stat-val">
                  {milliToQty(detail.low_stock_threshold)} {detail.base_unit}
                </span>
              </div>
            </div>

            {/* Metadata Table */}
            <div className="meta-box">
              <div className="meta-row">
                <span className="meta-k">Category:</span>
                <span className="meta-v">{detail.category || 'General'}</span>
              </div>
              <div className="meta-row">
                <span className="meta-k">Status:</span>
                <span className="meta-v">
                  {detail.active ? (
                    <span className="badge badge-success">Active</span>
                  ) : (
                    <span className="badge badge-danger">Inactive</span>
                  )}
                </span>
              </div>
              <div className="meta-row">
                <span className="meta-k">Registered:</span>
                <span className="meta-v">{new Date(detail.created_at).toLocaleString()}</span>
              </div>
              <div className="meta-row">
                <span className="meta-k">Last Updated:</span>
                <span className="meta-v">{new Date(detail.updated_at).toLocaleString()}</span>
              </div>
            </div>

            {/* Unit Conversions Management Section */}
            <div className="conversions-section">
              <div className="conversions-header">
                <div>
                  <h4>Explicit Unit Conversions</h4>
                  <p className="field-help">
                    Define conversion rules so shopkeepers can sell or purchase in boxes,
                    bags, or packets while tracking in {detail.base_unit}.
                  </p>
                </div>
              </div>

              {convNotice && (
                <div className={`alert-banner alert-${convNotice.tone}`}>
                  {convNotice.text}
                </div>
              )}

              {detail.conversions && detail.conversions.length > 0 ? (
                <div className="conversions-list">
                  {detail.conversions.map((conv) => (
                    <div key={conv.id} className="conversion-item">
                      <span className="conv-rule">
                        1 <strong>{conv.from_unit}</strong> ={' '}
                        <strong>{milliToQty(conv.factor)}</strong> {conv.to_unit}
                      </span>
                      <button
                        type="button"
                        className="btn-delete-conv"
                        title="Delete rule"
                        onClick={() => handleDeleteConversion(conv.id)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-conversions">
                  No conversion rules defined yet.
                </div>
              )}

              {/* Add Conversion Form */}
              <form onSubmit={handleAddConversion} className="add-conv-form">
                <h5>+ Add Unit Conversion Rule</h5>
                <div className="conv-form-row">
                  <div className="conv-field">
                    <label>1 Source Unit</label>
                    <input
                      type="text"
                      className={`form-input ${convErrors.from_unit ? 'input-error' : ''}`}
                      placeholder="e.g. box, bag, packet"
                      value={convForm.from_unit}
                      onChange={(e) =>
                        setConvForm((prev) => ({ ...prev, from_unit: e.target.value }))
                      }
                    />
                    {convErrors.from_unit && (
                      <span className="field-error">{convErrors.from_unit}</span>
                    )}
                  </div>

                  <span className="conv-equals">=</span>

                  <div className="conv-field">
                    <label>Equals (Qty)</label>
                    <input
                      type="number"
                      step="any"
                      min="0.001"
                      className={`form-input ${convErrors.factor ? 'input-error' : ''}`}
                      placeholder="e.g. 24"
                      value={convForm.factor}
                      onChange={(e) =>
                        setConvForm((prev) => ({ ...prev, factor: e.target.value }))
                      }
                    />
                    {convErrors.factor && (
                      <span className="field-error">{convErrors.factor}</span>
                    )}
                  </div>

                  <div className="conv-field">
                    <label>Target Unit</label>
                    <input
                      type="text"
                      className={`form-input ${convErrors.to_unit ? 'input-error' : ''}`}
                      placeholder="e.g. piece, kg"
                      value={convForm.to_unit}
                      onChange={(e) =>
                        setConvForm((prev) => ({ ...prev, to_unit: e.target.value }))
                      }
                    />
                    {convErrors.to_unit && (
                      <span className="field-error">{convErrors.to_unit}</span>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="btn btn-outline conv-submit-btn"
                    disabled={convSubmitting}
                  >
                    {convSubmitting ? 'Adding…' : 'Add Rule'}
                  </button>
                </div>
              </form>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  onClose()
                  onEdit()
                }}
              >
                Edit Product
              </button>
              <button type="button" className="btn btn-outline" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function DeactivateConfirmModal({ product, onClose, onConfirm }) {
  return (
    <div className="modal-backdrop">
      <div className="modal-content modal-sm">
        <div className="modal-header">
          <h3>Deactivate Product</h3>
          <button type="button" className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <p>
            Are you sure you want to deactivate <strong>{product.name}</strong> (
            {product.sku})?
          </p>
          <p className="field-help warning-text">
            This product will be hidden from everyday sales and active lists, but all
            historical inventory movements and register records are permanently preserved.
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
            Yes, Deactivate
          </button>
        </div>
      </div>
    </div>
  )
}
