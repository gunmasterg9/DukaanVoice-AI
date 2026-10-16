/**
 * Frontend HTTP client. The backend remains the authority for validation and data.
 * Phase 2 adds product management and unit conversion API calls.
 */

const API_BASE = ((typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || '/api').replace(/\/$/, '')

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

  // Low-stock reorder draft
  prepareReorderDraft: (data = {}) =>
    request('/products/reorder-draft', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Customers & Udhaar Khata
  getCustomers: (params = {}) => {
    const query = new URLSearchParams()
    if (params.query) query.set('query', params.query)
    if (params.active !== undefined && params.active !== null) {
      query.set('active', String(params.active))
    }
    if (params.limit) query.set('limit', String(params.limit))
    if (params.offset) query.set('offset', String(params.offset))
    const qs = query.toString()
    return request(`/customers${qs ? `?${qs}` : ''}`)
  },

  getCustomer: (id) => request(`/customers/${id}`),

  createCustomer: (data) =>
    request('/customers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateCustomer: (id, data) =>
    request(`/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deactivateCustomer: (id) =>
    request(`/customers/${id}/deactivate`, {
      method: 'PATCH',
    }),

  recordCustomerPayment: (customerId, data) =>
    request(`/customers/${customerId}/payments`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getCustomerStatement: (customerId, params = {}) => {
    const query = new URLSearchParams()
    if (params.from_date) query.set('from_date', params.from_date)
    if (params.to_date) query.set('to_date', params.to_date)
    const qs = query.toString()
    return request(`/customers/${customerId}/statement${qs ? `?${qs}` : ''}`)
  },

  // Expenses Register
  getExpenses: (params = {}) => {
    const query = new URLSearchParams()
    if (params.from_date) query.set('from_date', params.from_date)
    if (params.to_date) query.set('to_date', params.to_date)
    if (params.category) query.set('category', params.category)
    if (params.payment_method) query.set('payment_method', params.payment_method)
    if (params.status) query.set('status', params.status)
    if (params.include_reversed) query.set('include_reversed', 'true')
    if (params.limit) query.set('limit', String(params.limit))
    if (params.offset) query.set('offset', String(params.offset))
    const qs = query.toString()
    return request(`/expenses${qs ? `?${qs}` : ''}`)
  },

  getExpenseCategories: () => request('/expenses/categories'),

  createExpense: (data) =>
    request('/expenses', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateExpense: (id, data) =>
    request(`/expenses/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  reverseExpense: (id, reason = '') =>
    request(`/expenses/${id}/reverse`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  // Daily Cash Closing & Reconciliation
  getCashClosingPreview: (params = {}) => {
    const query = new URLSearchParams()
    if (params.business_date) query.set('business_date', params.business_date)
    if (params.opening_cash !== undefined && params.opening_cash !== null) {
      query.set('opening_cash', String(params.opening_cash))
    }
    const qs = query.toString()
    return request(`/cash-closing/preview${qs ? `?${qs}` : ''}`)
  },

  createCashClosing: (data) =>
    request('/cash-closing', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  finalizeCashClosing: (identifier) =>
    request(`/cash-closing/${identifier}/finalize`, {
      method: 'POST',
    }),

  listCashClosings: (params = {}) => {
    const query = new URLSearchParams()
    if (params.start_date) query.set('start_date', params.start_date)
    if (params.end_date) query.set('end_date', params.end_date)
    if (params.status) query.set('status', params.status)
    if (params.limit) query.set('limit', String(params.limit))
    if (params.offset) query.set('offset', String(params.offset))
    const qs = query.toString()
    return request(`/cash-closing${qs ? `?${qs}` : ''}`)
  },
}


