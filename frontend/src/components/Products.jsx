import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { useI18n } from '../i18n/I18nContext'
import {
  milliToQty,
  paiseToRupees,
  qtyToMilli,
  rupeesToPaise,
  validateConversionForm,
  validateProductForm,
} from '../utils/formatters'

export function Products() {
  const { t } = useI18n()
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

  const [reorderLoading, setReorderLoading] = useState(false)
  const handlePrepareReorderDraft = async () => {
    setReorderLoading(true)
    setError(null)
    try {
      const draft = await api.prepareReorderDraft()
      showNotice(
        `${t('low_stock.draft_success')} (Draft #${draft.id} - ${draft.items?.length || 0} items)`
      )
    } catch (err) {
      showNotice(err.message || 'Failed to prepare purchase draft.', 'danger')
    } finally {
      setReorderLoading(false)
    }
  }

  return (
    <div className="products-view">
      {/* Top Header */}
      <div className="section-header">
        <div>
          <h2>{t('products.title')}</h2>
          <p className="subtitle">
            {t('products.subtitle')}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setActiveModal({ type: 'add' })}
        >
          {t('products.add_product')}
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
            placeholder={t('products.search_placeholder')}
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
            <option value="">{t('products.all_categories')}</option>
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
            <option value="all">{t('products.status_all')}</option>
            <option value="active">{t('products.status_active')}</option>
            <option value="inactive">{t('products.status_inactive')}</option>
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
            <span>{t('products.low_stock_only')}</span>
          </label>

          <button
            type="button"
            className="btn btn-outline"
            style={{ marginLeft: 'auto' }}
            disabled={reorderLoading}
            onClick={handlePrepareReorderDraft}
          >
            {reorderLoading ? <span className="spinner" /> : `📋 ${t('low_stock.reorder_draft_btn')}`}
          </button>
        </div>
      </div>

      {/* Product Table / Content */}
      <div className="card table-card">
        {loading ? (
          <div className="table-loading">
            <div className="spinner" />
            <p>{t('common.loading')}</p>
          </div>
        ) : error ? (
          <div className="table-error">
            <p>{error}</p>
            <button type="button" className="btn btn-outline" onClick={fetchProducts}>
              {t('common.try_again')}
            </button>
          </div>
        ) : products.length === 0 ? (
          <div className="table-empty">
            <div className="empty-icon">📦</div>
            <h3>{t('products.no_products_found')}</h3>
            <p>
              {search || categoryFilter || lowStockOnly || activeFilter !== 'all'
                ? t('products.no_products_found')
                : t('products.subtitle')}
            </p>
            {!search && !categoryFilter && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setActiveModal({ type: 'add' })}
              >
                {t('products.add_product')}
              </button>
            )}
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('products.table_name')} &amp; {t('products.table_sku')}</th>
                  <th>{t('products.table_category')}</th>
                  <th>{t('products.table_stock')}</th>
                  <th>{t('products.field_base_unit')}</th>
                  <th>{t('products.table_purchase_price')}</th>
                  <th>{t('products.table_selling_price')}</th>
                  <th>{t('products.table_status')}</th>
                  <th className="th-actions">{t('products.table_actions')}</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className={!p.active ? 'row-inactive' : ''}>
                    <td>
                      <div className="product-title-cell">
                        <span className="product-name">{p.name}</span>
                        <span className="product-sku">{p.sku || '—'}</span>
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
                            {t('products.badge_low_stock')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>{p.base_unit}</td>
                    <td>{paiseToRupees(p.purchase_price)}</td>
                    <td className="selling-price">{paiseToRupees(p.selling_price)}</td>
                    <td>
                      {p.active ? (
                        <span className="badge badge-success">{t('products.badge_active')}</span>
                      ) : (
                        <span className="badge badge-danger">{t('products.badge_inactive')}</span>
                      )}
                    </td>
                    <td className="td-actions">
                      <button
                        type="button"
                        className="btn-action"
                        title="View details & conversions"
                        onClick={() => setActiveModal({ type: 'view', product: p })}
                      >
                        {t('products.action_view')}
                      </button>
                      <button
                        type="button"
                        className="btn-action"
                        title="Edit details"
                        onClick={() => setActiveModal({ type: 'edit', product: p })}
                      >
                        {t('products.action_edit')}
                      </button>
                      {p.active ? (
                        <button
                          type="button"
                          className="btn-action btn-action-danger"
                          title="Deactivate product"
                          onClick={() => setActiveModal({ type: 'deactivate', product: p })}
                        >
                          {t('products.action_deactivate')}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-action btn-action-success"
                          title="Reactivate product"
                          onClick={() => handleReactivate(p)}
                        >
                          {t('products.action_reactivate')}
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
              {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} / {total} {t('common.items')}
            </span>
            <div className="pagination-controls">
              <button
                type="button"
                className="btn btn-outline"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                {t('common.prev')}
              </button>
              <span className="page-number">{t('common.page')} {page + 1}</span>
              <button
                type="button"
                className="btn btn-outline"
                disabled={(page + 1) * pageSize >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                {t('common.next')}
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
  const { t } = useI18n()
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
        sku: formData.sku?.trim() ? formData.sku.trim() : null,
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
        sku: formData.sku?.trim() ? formData.sku.trim() : null,
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
          <h3>{isEdit ? t('products.modal_edit_title') : t('products.modal_add_title')}</h3>
          <button type="button" className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        {apiError && <div className="alert-banner alert-danger">{apiError}</div>}

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-row">
            <div className="form-group flex-2">
              <label>{t('products.field_name')}</label>
              <input
                type="text"
                className={`form-input ${errors.name ? 'input-error' : ''}`}
                placeholder={t('products.field_name_placeholder')}
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
              />
              {errors.name && <span className="field-error">{errors.name}</span>}
            </div>

            <div className="form-group flex-1">
              <label>{t('products.field_sku')}</label>
              <input
                type="text"
                className={`form-input ${errors.sku ? 'input-error' : ''}`}
                placeholder={t('products.field_sku_placeholder')}
                value={formData.sku}
                onChange={(e) => handleChange('sku', e.target.value)}
              />
              {errors.sku && <span className="field-error">{errors.sku}</span>}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group flex-1">
              <label>{t('products.field_category')}</label>
              <input
                type="text"
                className="form-input"
                placeholder={t('products.field_category_placeholder')}
                value={formData.category}
                onChange={(e) => handleChange('category', e.target.value)}
              />
            </div>

            <div className="form-group flex-1">
              <label>{t('products.field_base_unit')}</label>
              <input
                type="text"
                className={`form-input ${errors.base_unit ? 'input-error' : ''}`}
                placeholder={t('products.field_base_unit_placeholder')}
                value={formData.base_unit}
                onChange={(e) => handleChange('base_unit', e.target.value)}
              />
              {errors.base_unit && <span className="field-error">{errors.base_unit}</span>}
            </div>
          </div>

          {!isEdit && (
            <div className="form-group">
              <label>{t('products.field_opening_stock', { unit: formData.base_unit || 'units' })}</label>
              <input
                type="number"
                step="any"
                min="0"
                className={`form-input ${errors.opening_stock ? 'input-error' : ''}`}
                value={formData.opening_stock}
                onChange={(e) => handleChange('opening_stock', e.target.value)}
              />
              <span className="field-help">
                {t('products.field_opening_stock_help')}
              </span>
              {errors.opening_stock && (
                <span className="field-error">{errors.opening_stock}</span>
              )}
            </div>
          )}

          <div className="form-row">
            <div className="form-group flex-1">
              <label>{t('products.field_purchase_price')}</label>
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
              <label>{t('products.field_selling_price')}</label>
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
              <label>{t('products.field_low_stock_threshold', { unit: formData.base_unit || 'units' })}</label>
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
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? t('common.saving') : isEdit ? t('common.save') : t('products.add_product')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ProductDetailModal({ productId, onClose, onEdit }) {
  const { t } = useI18n()
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
            <h3>{t('products.modal_detail_title')}</h3>
            {detail && <span className="modal-subtitle">{detail.name}{detail.sku ? ` (${detail.sku})` : ''}</span>}
          </div>
          <button type="button" className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        {loading ? (
          <div className="modal-loading">
            <div className="spinner" />
            <p>{t('common.loading')}</p>
          </div>
        ) : error ? (
          <div className="modal-error">
            <p>{error}</p>
            <button type="button" className="btn btn-outline" onClick={loadDetail}>
              {t('common.try_again')}
            </button>
          </div>
        ) : detail ? (
          <div className="detail-layout">
            {/* Overview Stats */}
            <div className="detail-grid">
              <div className="detail-stat">
                <span className="stat-label">{t('products.table_stock')}</span>
                <span className="stat-val">
                  {milliToQty(detail.stock_qty)} {detail.base_unit}
                </span>
                {detail.is_low_stock && (
                  <span className="badge badge-warning">{t('products.badge_low_stock')}</span>
                )}
              </div>

              <div className="detail-stat">
                <span className="stat-label">{t('products.table_selling_price')}</span>
                <span className="stat-val selling-price">
                  {paiseToRupees(detail.selling_price)}
                </span>
                <span className="stat-sub">per {detail.base_unit}</span>
              </div>

              <div className="detail-stat">
                <span className="stat-label">{t('products.table_purchase_price')}</span>
                <span className="stat-val">{paiseToRupees(detail.purchase_price)}</span>
                <span className="stat-sub">per {detail.base_unit}</span>
              </div>

              <div className="detail-stat">
                <span className="stat-label">{t('products.field_low_stock_threshold', { unit: detail.base_unit })}</span>
                <span className="stat-val">
                  {milliToQty(detail.low_stock_threshold)} {detail.base_unit}
                </span>
              </div>
            </div>

            {/* Metadata Table */}
            <div className="meta-box">
              <div className="meta-row">
                <span className="meta-k">{t('products.table_category')}:</span>
                <span className="meta-v">{detail.category || '—'}</span>
              </div>
              <div className="meta-row">
                <span className="meta-k">{t('products.table_status')}:</span>
                <span className="meta-v">
                  {detail.active ? (
                    <span className="badge badge-success">{t('products.badge_active')}</span>
                  ) : (
                    <span className="badge badge-danger">{t('products.badge_inactive')}</span>
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
                  <h4>{t('products.modal_conversions_title')}</h4>
                  <p className="field-help">
                    {t('products.conversions_subtitle')}
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
                        {t('common.delete')}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-conversions">
                  {t('products.no_conversions')}
                </div>
              )}

              {/* Add Conversion Form */}
              <form onSubmit={handleAddConversion} className="add-conv-form">
                <h5>+ {t('products.btn_add_conversion')}</h5>
                <div className="conv-form-row">
                  <div className="conv-field">
                    <label>{t('products.field_from_unit')}</label>
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
                    <label>{t('products.table_factor')}</label>
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
                    <label>{t('products.field_to_unit')}</label>
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
                    {convSubmitting ? t('common.loading') : t('products.btn_add_conversion')}
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
                {t('products.action_edit')}
              </button>
              <button type="button" className="btn btn-outline" onClick={onClose}>
                {t('common.close')}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function DeactivateConfirmModal({ product, onClose, onConfirm }) {
  const { t } = useI18n()
  return (
    <div className="modal-backdrop">
      <div className="modal-content modal-sm">
        <div className="modal-header">
          <h3>{t('products.modal_deactivate_title')}</h3>
          <button type="button" className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <p>
            {t('products.deactivate_warning', { name: product.name, sku: product.sku || '—' })}
          </p>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-accent btn-danger-tone"
            onClick={onConfirm}
          >
            {t('products.btn_confirm_deactivate')}
          </button>
        </div>
      </div>
    </div>
  )
}
