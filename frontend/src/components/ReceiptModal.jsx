import { useI18n } from '../i18n/I18nContext'
import { milliToQty, paiseToRupees } from '../utils/formatters'

export function ReceiptModal({ transaction, customer, onClose }) {
  const { t } = useI18n()

  if (!transaction) return null

  const isCredit = transaction.payment_method === 'credit'
  const isUpi = transaction.payment_method === 'upi'
  const isCash = transaction.payment_method === 'cash' || !transaction.payment_method

  const totalPaise = transaction.total_amount || 0
  const amountPaidPaise = isCredit ? 0 : totalPaise
  const amountDuePaise = isCredit ? totalPaise : 0

  const handlePrint = () => {
    window.print()
  }

  const customerName = transaction.customer_name || customer?.name || null

  return (
    <div className="modal-overlay receipt-modal-overlay" onClick={onClose}>
      <div
        className="modal-card receipt-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="receipt-title"
      >
        <div className="receipt-actions no-print">
          <button type="button" className="btn btn-primary" onClick={handlePrint}>
            🖨️ {t('receipt.print')}
          </button>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            ✕ {t('receipt.close')}
          </button>
        </div>

        {/* Printable Paper Slip */}
        <div className="printable-receipt">
          <div className="receipt-header">
            <div className="receipt-shop-logo">🏪</div>
            <h2 className="receipt-shop-name">{t('receipt.shop_name')}</h2>
            <div className="receipt-memo-tag">{t('receipt.receipt_title')}</div>
            <div className="receipt-divider" />
          </div>

          <div className="receipt-meta-grid">
            <div className="receipt-meta-item">
              <span className="receipt-meta-label">{t('receipt.invoice_no')}:</span>
              <span className="receipt-meta-value">#{transaction.id}</span>
            </div>
            <div className="receipt-meta-item">
              <span className="receipt-meta-label">{t('receipt.date')}:</span>
              <span className="receipt-meta-value">
                {transaction.confirmed_at || transaction.created_at || '—'}
              </span>
            </div>
            {customerName && (
              <div className="receipt-meta-item receipt-meta-span">
                <span className="receipt-meta-label">{t('receipt.customer')}:</span>
                <span className="receipt-meta-value">
                  <strong>{customerName}</strong>
                  {customer?.phone ? ` (${customer.phone})` : ''}
                </span>
              </div>
            )}
          </div>

          <div className="receipt-divider" />

          {/* Line Items Table */}
          <table className="receipt-items-table">
            <thead>
              <tr>
                <th className="th-item">{t('receipt.item')}</th>
                <th className="th-qty">{t('receipt.qty')}</th>
                <th className="th-rate">{t('receipt.rate')}</th>
                <th className="th-amount">{t('receipt.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {(transaction.items || []).map((it, idx) => (
                <tr key={it.id || idx}>
                  <td className="td-item">
                    <span className="item-name">{it.product_name}</span>
                  </td>
                  <td className="td-qty">
                    {milliToQty(it.quantity)} {it.unit}
                  </td>
                  <td className="td-rate">₹{paiseToRupees(it.unit_price)}</td>
                  <td className="td-amount">₹{paiseToRupees(it.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="receipt-divider" />

          {/* Payment & Total Breakdown */}
          <div className="receipt-totals">
            <div className="receipt-total-row grand-total">
              <span>{t('receipt.total')}</span>
              <span>₹{paiseToRupees(totalPaise)}</span>
            </div>

            <div className="receipt-total-row">
              <span>{t('receipt.payment_mode')}</span>
              <span className="payment-badge">
                {isCash && `💵 ${t('quick_sale.payment_cash')}`}
                {isUpi && `📱 ${t('quick_sale.payment_upi')}`}
                {isCredit && `📒 ${t('quick_sale.payment_credit')}`}
              </span>
            </div>

            {isUpi && (
              <div className="receipt-upi-disclaimer">
                ℹ️ {t('receipt.upi_disclaimer')}
              </div>
            )}

            <div className="receipt-divider" />

            <div className="receipt-total-row paid-row">
              <span>{t('receipt.amount_paid')}:</span>
              <span className="amount-paid-val">₹{paiseToRupees(amountPaidPaise)}</span>
            </div>

            {isCredit && (
              <>
                <div className="receipt-total-row credit-row">
                  <span>{t('receipt.amount_due')}:</span>
                  <span className="amount-due-val">₹{paiseToRupees(amountDuePaise)}</span>
                </div>
                {customer?.current_balance !== undefined && (
                  <div className="receipt-total-row total-khata-row">
                    <span>{t('receipt.outstanding_balance')}:</span>
                    <span>₹{paiseToRupees(customer.current_balance)}</span>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="receipt-footer">
            <p className="receipt-thank-you">{t('receipt.thank_you')}</p>
            <p className="receipt-app-brand">DukaanVoice AI</p>
          </div>
        </div>
      </div>
    </div>
  )
}
