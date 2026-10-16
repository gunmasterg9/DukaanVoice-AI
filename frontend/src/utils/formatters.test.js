import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  filterProductsLocally,
  formatTransactionStatus,
  formatTransactionType,
  milliToQty,
  paiseToRupees,
  qtyToMilli,
  rupeesToPaise,
  validateConversionForm,
  validateProductForm,
  validateTransactionDraft,
} from './formatters.js'

describe('Formatters and Money Conversion', () => {
  it('formats paise to Rupees correctly', () => {
    assert.equal(paiseToRupees(0), '₹0.00')
    assert.equal(paiseToRupees(1500), '₹15.00')
    assert.equal(paiseToRupees(1250), '₹12.50')
    assert.equal(paiseToRupees(99), '₹0.99')
    assert.equal(paiseToRupees(null), '₹0.00')
  })

  it('converts rupees string/number to integer paise', () => {
    assert.equal(rupeesToPaise('15.00'), 1500)
    assert.equal(rupeesToPaise('12.50'), 1250)
    assert.equal(rupeesToPaise(10), 1000)
    assert.equal(rupeesToPaise('0'), 0)
    assert.equal(rupeesToPaise('-5'), 0)
  })

  it('converts milli-units to quantity representation', () => {
    assert.equal(milliToQty(1000), '1')
    assert.equal(milliToQty(2500), '2.5')
    assert.equal(milliToQty(500), '0.5')
    assert.equal(milliToQty(0), '0')
  })

  it('converts decimal quantity to integer milli-units', () => {
    assert.equal(qtyToMilli('1'), 1000)
    assert.equal(qtyToMilli('2.5'), 2500)
    assert.equal(qtyToMilli(0.5), 500)
    assert.equal(qtyToMilli('0'), 0)
  })
})

describe('Validation Helpers', () => {
  it('validates product form correctly', () => {
    const valid = {
      name: 'Sugar',
      sku: 'SKU-SUGAR',
      base_unit: 'kg',
      purchase_price: '40',
      selling_price: '45',
      opening_stock: '10',
      low_stock_threshold: '2',
    }
    const result = validateProductForm(valid)
    assert.equal(result.isValid, true)
    assert.equal(Object.keys(result.errors).length, 0)
  })

  it('rejects product form with missing required fields (name and base_unit, not sku)', () => {
    const invalid = {
      name: '  ',
      sku: '',
      base_unit: '',
    }
    const result = validateProductForm(invalid)
    assert.equal(result.isValid, false)
    assert.ok(result.errors.name)
    assert.equal(result.errors.sku, undefined)
    assert.ok(result.errors.base_unit)
  })

  it('allows product form with empty or omitted SKU', () => {
    const withoutSku = {
      name: 'Local Rice',
      sku: '',
      base_unit: 'kg',
      purchase_price: '50',
      selling_price: '60',
    }
    const res1 = validateProductForm(withoutSku)
    assert.equal(res1.isValid, true)
    assert.equal(res1.errors.sku, undefined)

    const noSkuKey = {
      name: 'Local Wheat',
      base_unit: 'kg',
    }
    const res2 = validateProductForm(noSkuKey)
    assert.equal(res2.isValid, true)
    assert.equal(res2.errors.sku, undefined)
  })

  it('rejects product form with negative values', () => {
    const invalid = {
      name: 'Flour',
      sku: 'SKU-FLOUR',
      base_unit: 'kg',
      purchase_price: '-10',
      selling_price: '-5',
      opening_stock: '-2',
      low_stock_threshold: '-1',
    }
    const result = validateProductForm(invalid)
    assert.equal(result.isValid, false)
    assert.ok(result.errors.purchase_price)
    assert.ok(result.errors.selling_price)
    assert.ok(result.errors.opening_stock)
    assert.ok(result.errors.low_stock_threshold)
  })

  it('validates conversion form properly', () => {
    const valid = {
      from_unit: 'box',
      to_unit: 'piece',
      factor: '24',
    }
    assert.equal(validateConversionForm(valid).isValid, true)

    // Same from and to unit
    const sameUnit = {
      from_unit: 'box',
      to_unit: 'box',
      factor: '10',
    }
    const resSame = validateConversionForm(sameUnit)
    assert.equal(resSame.isValid, false)
    assert.ok(resSame.errors.to_unit)

    // Negative/zero factor
    const badFactor = {
      from_unit: 'box',
      to_unit: 'piece',
      factor: '0',
    }
    const resFactor = validateConversionForm(badFactor)
    assert.equal(resFactor.isValid, false)
    assert.ok(resFactor.errors.factor)
  })
})

describe('Search and Filter Helpers', () => {
  const sampleProducts = [
    { name: 'Basmati Rice', sku: 'SKU-RICE', category: 'Grains' },
    { name: 'Wheat Flour', sku: 'SKU-FLOUR', category: 'Grains' },
    { name: 'Sunflower Oil', sku: 'SKU-OIL', category: 'Oil' },
  ]

  it('filters products by name', () => {
    const res = filterProductsLocally(sampleProducts, 'rice')
    assert.equal(res.length, 1)
    assert.equal(res[0].name, 'Basmati Rice')
  })

  it('filters products by SKU', () => {
    const res = filterProductsLocally(sampleProducts, 'FLOUR')
    assert.equal(res.length, 1)
    assert.equal(res[0].name, 'Wheat Flour')
  })

  it('returns all when query is empty', () => {
    const res = filterProductsLocally(sampleProducts, '')
    assert.equal(res.length, 3)
  })
})

describe('Transaction Helpers and Validation', () => {
  it('validates a valid transaction draft', () => {
    const draft = {
      type: 'sale',
      items: [
        { product_id: 1, quantity: '2', unit: 'kg', unit_price: '45.00' },
      ],
    }
    const res = validateTransactionDraft(draft)
    assert.equal(res.isValid, true)
    assert.equal(Object.keys(res.errors.items).length, 0)
  })

  it('rejects draft with missing items or bad type', () => {
    const noItems = { type: 'invalid_type', items: [] }
    const res = validateTransactionDraft(noItems)
    assert.equal(res.isValid, false)
    assert.ok(res.errors.type)
    assert.ok(res.errors.general)
  })

  it('flags line item errors for negative quantity or price', () => {
    const badItems = {
      type: 'purchase',
      items: [
        { product_id: null, quantity: '0', unit: '', unit_price: '-10' },
      ],
    }
    const res = validateTransactionDraft(badItems)
    assert.equal(res.isValid, false)
    assert.ok(res.errors.items[0].product_id)
    assert.ok(res.errors.items[0].quantity)
    assert.ok(res.errors.items[0].unit)
    assert.ok(res.errors.items[0].unit_price)
  })

  it('formats status and type badges accurately', () => {
    assert.equal(formatTransactionStatus('confirmed').tone, 'success')
    assert.equal(formatTransactionStatus('draft').tone, 'warning')
    assert.equal(formatTransactionStatus('reversed').tone, 'danger')
    assert.equal(formatTransactionType('sale').label, 'Sale')
    assert.equal(formatTransactionType('purchase').label, 'Purchase')
  })
})

