/**
 * Frontend HTTP client. The backend remains the authority for validation and data.
 * Phase 2 adds product management and unit conversion API calls.
 */

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

async function request(path, options = {}) {
  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  }

  const response = await fetch(`${API_BASE}${path}`, config)

  if (!response.ok) {
    let errorDetail = `Request failed (${response.status})`
    try {
      const errBody = await response.json()
      if (errBody) {
        if (typeof errBody.detail === 'string') {
          errorDetail = errBody.detail
        } else if (Array.isArray(errBody.detail)) {
          errorDetail = errBody.detail.map((e) => e.msg || e.message).join(', ')
        } else if (errBody.message) {
          errorDetail = errBody.message
        }
      }
    } catch {
      // response body was not JSON
    }
    throw new Error(errorDetail)
  }

  return response.json()
}

export const api = {
  // Health
  health: () => request('/health'),
  ready: () => request('/health/ready'),

  // Products
  getProducts: (params = {}) => {
    const query = new URLSearchParams()
    if (params.query) query.set('query', params.query)
    if (params.category) query.set('category', params.category)
    if (params.active !== undefined && params.active !== null) {
      query.set('active', String(params.active))
    }
    if (params.low_stock_only) query.set('low_stock_only', 'true')
    if (params.limit) query.set('limit', String(params.limit))
    if (params.offset) query.set('offset', String(params.offset))

    const qs = query.toString()
    return request(`/products${qs ? `?${qs}` : ''}`)
  },

  getProduct: (id) => request(`/products/${id}`),

  createProduct: (data) =>
    request('/products', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateProduct: (id, data) =>
    request(`/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deactivateProduct: (id) =>
    request(`/products/${id}/deactivate`, {
      method: 'PATCH',
    }),

  reactivateProduct: (id) =>
    request(`/products/${id}/reactivate`, {
      method: 'PATCH',
    }),

  // Unit conversions
  getConversions: (productId) => request(`/products/${productId}/conversions`),

  createConversion: (productId, data) =>
    request(`/products/${productId}/conversions`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateConversion: (productId, conversionId, data) =>
    request(`/products/${productId}/conversions/${conversionId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteConversion: (productId, conversionId) =>
    request(`/products/${productId}/conversions/${conversionId}`, {
      method: 'DELETE',
    }),

  // Transactions
  getTransactions: (params = {}) => {
    const query = new URLSearchParams()
    if (params.type) query.set('type', params.type)
    if (params.status) query.set('status', params.status)
    if (params.product_id) query.set('product_id', String(params.product_id))
    if (params.start_date) query.set('start_date', params.start_date)
    if (params.end_date) query.set('end_date', params.end_date)
    if (params.limit) query.set('limit', String(params.limit))
    if (params.offset) query.set('offset', String(params.offset))

    const qs = query.toString()
    return request(`/transactions${qs ? `?${qs}` : ''}`)
  },

  getTransaction: (id) => request(`/transactions/${id}`),

  createTransactionDraft: (data) =>
    request('/transactions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  confirmTransaction: (id) =>
    request(`/transactions/${id}/confirm`, {
      method: 'PATCH',
    }),

  reverseTransaction: (id) =>
    request(`/transactions/${id}/reverse`, {
      method: 'POST',
    }),

  // Phase 4 Reports & Reconciliation
  getDailySalesReport: (params = {}) => {
    const query = new URLSearchParams()
    if (params.start_date) query.set('start_date', params.start_date)
    if (params.end_date) query.set('end_date', params.end_date)
    const qs = query.toString()
    return request(`/reports/sales/daily${qs ? `?${qs}` : ''}`)
  },

  getPurchasesReport: (params = {}) => {
    const query = new URLSearchParams()
    if (params.start_date) query.set('start_date', params.start_date)
    if (params.end_date) query.set('end_date', params.end_date)
    const qs = query.toString()
    return request(`/reports/purchases${qs ? `?${qs}` : ''}`)
  },

  getProductSalesReport: (params = {}) => {
    const query = new URLSearchParams()
    if (params.start_date) query.set('start_date', params.start_date)
    if (params.end_date) query.set('end_date', params.end_date)
    if (params.product_id) query.set('product_id', String(params.product_id))
    if (params.category) query.set('category', params.category)
    const qs = query.toString()
    return request(`/reports/products${qs ? `?${qs}` : ''}`)
  },

  getInventorySummaryReport: (params = {}) => {
    const query = new URLSearchParams()
    if (params.low_stock_only) query.set('low_stock_only', 'true')
    if (params.category) query.set('category', params.category)
    if (params.query) query.set('query', params.query)
    const qs = query.toString()
    return request(`/reports/inventory${qs ? `?${qs}` : ''}`)
  },

  getReconciliationReport: (params = {}) => {
    const query = new URLSearchParams()
    if (params.product_id) query.set('product_id', String(params.product_id))
    const qs = query.toString()
    return request(`/reports/reconciliation${qs ? `?${qs}` : ''}`)
  },

  getInventoryMovements: (params = {}) => {
    const query = new URLSearchParams()
    if (params.product_id) query.set('product_id', String(params.product_id))
    if (params.movement_type) query.set('movement_type', params.movement_type)
    if (params.start_date) query.set('start_date', params.start_date)
    if (params.end_date) query.set('end_date', params.end_date)
    if (params.limit) query.set('limit', String(params.limit))
    if (params.offset) query.set('offset', String(params.offset))
    const qs = query.toString()
    return request(`/reports/inventory/movements${qs ? `?${qs}` : ''}`)
  },
}
