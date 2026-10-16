/**
 * Utilities for formatting money (paise <-> rupees) and quantities (milli-units <-> standard units),
 * and client-side validation helpers.
 */

export function paiseToRupees(paise) {
  if (paise === null || paise === undefined || isNaN(paise)) return '₹0.00'
  const val = Number(paise) / 100
  return `₹${val.toFixed(2)}`
}

export function rupeesToPaise(rupees) {
  if (rupees === null || rupees === undefined || rupees === '') return 0
  const parsed = parseFloat(String(rupees).trim())
  if (isNaN(parsed) || parsed < 0) return 0
  return Math.round(parsed * 100)
}

export function milliToQty(milli) {
  if (milli === null || milli === undefined || isNaN(milli)) return '0'
  const val = Number(milli) / 1000
  // Clean decimal: 2.500 -> 2.5, 2.000 -> 2
  return Number.isInteger(val) ? String(val) : parseFloat(val.toFixed(3)).toString()
}

export function qtyToMilli(qty) {
  if (qty === null || qty === undefined || qty === '') return 0
  const parsed = parseFloat(String(qty).trim())
  if (isNaN(parsed) || parsed < 0) return 0
  return Math.round(parsed * 100) * 10 // avoid floating point inaccuracy
}

export function validateProductForm(values) {
  const errors = {}

  if (!values.name || !values.name.trim()) {
    errors.name = 'Product name is required.'
  }

  if (!values.sku || !values.sku.trim()) {
    errors.sku = 'SKU is required.'
  }

  if (!values.base_unit || !values.base_unit.trim()) {
    errors.base_unit = 'Base unit is required.'
  }

  const pPrice = parseFloat(values.purchase_price)
  if (values.purchase_price !== '' && values.purchase_price !== undefined && (isNaN(pPrice) || pPrice < 0)) {
    errors.purchase_price = 'Purchase price must be 0 or greater.'
  }

  const sPrice = parseFloat(values.selling_price)
  if (values.selling_price !== '' && values.selling_price !== undefined && (isNaN(sPrice) || sPrice < 0)) {
    errors.selling_price = 'Selling price must be 0 or greater.'
  }

  const stock = parseFloat(values.opening_stock)
  if (values.opening_stock !== '' && values.opening_stock !== undefined && (isNaN(stock) || stock < 0)) {
    errors.opening_stock = 'Opening stock must be 0 or greater.'
  }

  const thresh = parseFloat(values.low_stock_threshold)
  if (values.low_stock_threshold !== '' && values.low_stock_threshold !== undefined && (isNaN(thresh) || thresh < 0)) {
    errors.low_stock_threshold = 'Threshold must be 0 or greater.'
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  }
}

export function validateConversionForm(values) {
  const errors = {}

  if (!values.from_unit || !values.from_unit.trim()) {
    errors.from_unit = 'Source unit is required.'
  }

  if (!values.to_unit || !values.to_unit.trim()) {
    errors.to_unit = 'Target unit is required.'
  }

  if (
    values.from_unit &&
    values.to_unit &&
    values.from_unit.trim().toLowerCase() === values.to_unit.trim().toLowerCase()
  ) {
    errors.to_unit = 'Target unit must be different from source unit.'
  }

  const factor = parseFloat(values.factor)
  if (isNaN(factor) || factor <= 0) {
    errors.factor = 'Conversion factor must be greater than 0.'
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  }
}

export function filterProductsLocally(items, query) {
  if (!query || !query.trim()) return items
  const q = query.trim().toLowerCase()
  return items.filter(
    (item) =>
      (item.name && item.name.toLowerCase().includes(q)) ||
      (item.sku && item.sku.toLowerCase().includes(q)) ||
      (item.category && item.category.toLowerCase().includes(q))
  )
}

export function validateTransactionDraft(values) {
  const errors = { items: {} }

  if (!values.type || !['sale', 'purchase'].includes(values.type)) {
    errors.type = 'Transaction type must be sale or purchase.'
  }

  if (!values.items || !Array.isArray(values.items) || values.items.length === 0) {
    errors.general = 'Transaction must have at least one line item.'
    return { isValid: false, errors }
  }

  let hasItemError = false

  values.items.forEach((item, idx) => {
    const itemErr = {}
    if (!item.product_id) {
      itemErr.product_id = 'Please select a product.'
    }
    const qty = parseFloat(item.quantity)
    if (isNaN(qty) || qty <= 0) {
      itemErr.quantity = 'Quantity must be greater than 0.'
    }
    if (!item.unit || !item.unit.trim()) {
      itemErr.unit = 'Unit is required.'
    }
    const price = parseFloat(item.unit_price)
    if (isNaN(price) || price < 0) {
      itemErr.unit_price = 'Price must be 0 or greater.'
    }

    if (Object.keys(itemErr).length > 0) {
      errors.items[idx] = itemErr
      hasItemError = true
    }
  })

  const isValid = !errors.type && !hasItemError && !errors.general
  return { isValid, errors }
}

export function formatTransactionStatus(status, t) {
  switch (status) {
    case 'confirmed':
      return { tone: 'success', label: t ? t('transactions.status_confirmed') : 'Confirmed' }
    case 'reversed':
      return { tone: 'danger', label: t ? t('transactions.status_reversed') : 'Reversed' }
    case 'draft':
    default:
      return { tone: 'warning', label: t ? t('transactions.status_draft') : 'Draft' }
  }
}

export function formatTransactionType(type, t) {
  switch (type) {
    case 'sale':
      return { tone: 'success', label: t ? t('transactions.type_sale') : 'Sale' }
    case 'purchase':
      return { tone: 'info', label: t ? t('transactions.type_purchase') : 'Purchase' }
    default:
      return { tone: 'secondary', label: type }
  }
}

export function formatReconciliationStatus(status, t) {
  switch (status) {
    case 'reconciled':
      return { tone: 'success', label: t ? t('reports.status_reconciled') : 'Reconciled' }
    case 'discrepancy':
      return { tone: 'danger', label: t ? t('reports.status_discrepancy') : 'Discrepancy' }
    case 'gap_detected':
      return { tone: 'danger', label: t ? t('reports.status_gap_detected') : 'Chain Gap' }
    case 'no_movements':
      return { tone: 'warning', label: t ? t('reports.status_no_movements') : 'No Movements' }
    default:
      return { tone: 'secondary', label: status || 'Unknown' }
  }
}

export function formatMovementType(type, t) {
  switch (type) {
    case 'sale':
      return { tone: 'danger', label: t ? t('transactions.type_sale') : 'Sale' }
    case 'purchase':
      return { tone: 'success', label: t ? t('transactions.type_purchase') : 'Purchase' }
    case 'adjustment':
      return { tone: 'info', label: 'Adjustment' }
    case 'reversal':
      return { tone: 'warning', label: 'Reversal' }
    default:
      return { tone: 'secondary', label: type || 'Movement' }
  }
}

