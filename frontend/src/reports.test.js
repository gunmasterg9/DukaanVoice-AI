import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formatMovementType,
  formatReconciliationStatus,
  milliToQty,
  paiseToRupees,
} from './utils/formatters.js'

test('Phase 4 Report Formatters', async (t) => {
  await t.test('formatReconciliationStatus maps statuses correctly', () => {
    assert.deepEqual(formatReconciliationStatus('reconciled'), {
      tone: 'success',
      label: 'Reconciled',
    })
    assert.deepEqual(formatReconciliationStatus('discrepancy'), {
      tone: 'danger',
      label: 'Discrepancy',
    })
    assert.deepEqual(formatReconciliationStatus('gap_detected'), {
      tone: 'danger',
      label: 'Chain Gap',
    })
    assert.deepEqual(formatReconciliationStatus('no_movements'), {
      tone: 'warning',
      label: 'No Movements',
    })
    assert.deepEqual(formatReconciliationStatus('other'), {
      tone: 'secondary',
      label: 'other',
    })
  })

  await t.test('formatMovementType maps inventory movement types correctly', () => {
    assert.deepEqual(formatMovementType('sale'), {
      tone: 'danger',
      label: 'Sale',
    })
    assert.deepEqual(formatMovementType('purchase'), {
      tone: 'success',
      label: 'Purchase',
    })
    assert.deepEqual(formatMovementType('adjustment'), {
      tone: 'info',
      label: 'Adjustment',
    })
    assert.deepEqual(formatMovementType('reversal'), {
      tone: 'warning',
      label: 'Reversal',
    })
  })

  await t.test('formats inventory valuation and paise correctly', () => {
    assert.equal(paiseToRupees(150000), '₹1500.00')
    assert.equal(paiseToRupees(0), '₹0.00')
    assert.equal(paiseToRupees(45), '₹0.45')
  })

  await t.test('formats stock quantity in milli-units correctly', () => {
    assert.equal(milliToQty(100000), '100')
    assert.equal(milliToQty(2500), '2.5')
    assert.equal(milliToQty(0), '0')
  })
})
