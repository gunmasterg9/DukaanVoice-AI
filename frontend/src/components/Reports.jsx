import { useEffect, useState } from 'react'
import { api } from '../services/api'
import {
  formatMovementType,
  formatReconciliationStatus,
  milliToQty,
  paiseToRupees,
} from '../utils/formatters'

export function Reports() {
  const [activeTab, setActiveTab] = useState('daily-sales')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Report Data
  const [salesReport, setSalesReport] = useState(null)
  const [purchasesReport, setPurchasesReport] = useState(null)
  const [productSalesReport, setProductSalesReport] = useState(null)
  const [inventoryReport, setInventoryReport] = useState(null)
  const [reconciliationReport, setReconciliationReport] = useState(null)

  // Sub-filters
  const [productQuery, setProductQuery] = useState('')
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [reconStatusFilter, setReconStatusFilter] = useState('all')

  // Movements Audit Modal: null | { productId, productName }
  const [movementsModal, setMovementsModal] = useState(null)
  const [movementsData, setMovementsData] = useState([])
  const [movementsLoading, setMovementsLoading] = useState(false)

  // Fetch report based on activeTab
  useEffect(() => {
    let ignore = false
    const params = {}
    if (startDate) params.start_date = startDate
    if (endDate) params.end_date = endDate

    let promise = null

    if (activeTab === 'daily-sales') {
      promise = api.getDailySalesReport(params).then((data) => {
        if (!ignore) {
          setSalesReport(data)
          setError(null)
        }
      })
    } else if (activeTab === 'purchases') {
      promise = api.getPurchasesReport(params).then((data) => {
        if (!ignore) {
          setPurchasesReport(data)
          setError(null)
        }
      })
    } else if (activeTab === 'product-sales') {
      promise = api.getProductSalesReport(params).then((data) => {
        if (!ignore) {
          setProductSalesReport(data)
          setError(null)
        }
      })
    } else if (activeTab === 'inventory') {
      promise = api.getInventorySummaryReport({ low_stock_only: lowStockOnly }).then((data) => {
        if (!ignore) {
          setInventoryReport(data)
          setError(null)
        }
      })
    } else if (activeTab === 'reconciliation') {
      promise = api.getReconciliationReport().then((data) => {
        if (!ignore) {
          setReconciliationReport(data)
          setError(null)
        }
      })
    }

    if (promise) {
      promise
        .catch((err) => {
          if (!ignore) setError(err.message || 'Failed to load report data')
        })
        .finally(() => {
          if (!ignore) setLoading(false)
        })
    }

    return () => {
      ignore = true
    }
  }, [activeTab, startDate, endDate, lowStockOnly])

  const switchTab = (tab) => {
    setActiveTab(tab)
    setLoading(true)
  }

  // Load movement ledger in modal
  const openMovements = (product) => {
    setMovementsModal(product)
    setMovementsLoading(true)
    api
      .getInventoryMovements({ product_id: product?.id, limit: 100 })
      .then((data) => {
        setMovementsData(data.items || [])
      })
      .catch((err) => {
        setError(err.message || 'Failed to load movement audit trail')
      })
      .finally(() => setMovementsLoading(false))
  }

  const handleResetDates = () => {
    setStartDate('')
    setEndDate('')
    setLoading(true)
  }

  return (
    <div className="reports-view">
      {/* Top Banner & Header */}
      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Business Reports &amp; Inventory Reconciliation</h2>
            <p className="placeholder-copy" style={{ marginTop: '4px' }}>
              Auditable sales analytics, purchase tracking, stock valuation, and mathematical ledger integrity checks.
            </p>
          </div>
          <span className="badge badge-info">Phase 4</span>
        </div>

        {/* Accounting Transparency Notice */}
        <div className="financial-note-banner" style={{ marginTop: 'var(--space-sm)' }}>
          <strong>Transparency Notice:</strong> Total revenue reflects customer payments from confirmed sales.
          Unconfirmed drafts are strictly excluded. Reversed sales are itemized separately and subtracted from net totals.
          DukaanVoice AI does not report estimated &quot;profit&quot; because batch-level acquisition cost tracking (COGS) is not supported in the database schema.
        </div>
      </div>

      {/* Tabs */}
      <div className="report-tabs">
        <button
          type="button"
          className={`report-tab-btn ${activeTab === 'daily-sales' ? 'active' : ''}`}
          onClick={() => switchTab('daily-sales')}
        >
          Daily Sales
        </button>
        <button
          type="button"
          className={`report-tab-btn ${activeTab === 'purchases' ? 'active' : ''}`}
          onClick={() => switchTab('purchases')}
        >
          Purchase Ledger
        </button>
        <button
          type="button"
          className={`report-tab-btn ${activeTab === 'product-sales' ? 'active' : ''}`}
          onClick={() => switchTab('product-sales')}
        >
          Product Sales
        </button>
        <button
          type="button"
          className={`report-tab-btn ${activeTab === 'inventory' ? 'active' : ''}`}
          onClick={() => switchTab('inventory')}
        >
          Inventory Summary
        </button>
        <button
          type="button"
          className={`report-tab-btn ${activeTab === 'reconciliation' ? 'active' : ''}`}
          onClick={() => switchTab('reconciliation')}
        >
          Reconciliation &amp; Audit
        </button>
      </div>

      {/* Date Filter Toolbar (for date-supported reports) */}
      {['daily-sales', 'purchases', 'product-sales'].includes(activeTab) && (
        <div className="card toolbar-card">
          <div className="date-filter-group">
            <span>Date Range:</span>
            <input
              type="date"
              className="input-field date-input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              title="Start date"
            />
            <span>to</span>
            <input
              type="date"
              className="input-field date-input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              title="End date"
            />
            {(startDate || endDate) && (
              <button
                type="button"
                className="btn btn-outline"
                style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                onClick={handleResetDates}
              >
                Reset Dates
              </button>
            )}
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="notice-banner notice-danger">
          <span>{error}</span>
          <button type="button" className="btn btn-outline" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-2xl)' }}>
          <div className="spinner" style={{ margin: '0 auto var(--space-md)' }} />
          <p className="placeholder-copy">Calculating authoritative report data...</p>
        </div>
      )}

      {/* TAB 1: DAILY SALES REPORT */}
      {!loading && activeTab === 'daily-sales' && salesReport && (
        <div className="reports-tab-content">
          {/* KPI Summary Cards */}
          <div className="status-grid">
            <div className="status-card tone-success">
              <div className="status-info">
                <h3>Confirmed Net Revenue</h3>
                <p className="summary-total-val" style={{ color: 'var(--color-success)' }}>
                  {paiseToRupees(salesReport.total_revenue)}
                </p>
                <div className="kpi-subtext">
                  {salesReport.total_transactions} confirmed sales transaction{salesReport.total_transactions !== 1 ? 's' : ''}
                </div>
              </div>
            </div>

            <div className="status-card tone-warning">
              <div className="status-info">
                <h3>Reversed Sales</h3>
                <p className="summary-total-val" style={{ color: 'var(--color-warning)' }}>
                  {paiseToRupees(salesReport.reversed_revenue)}
                </p>
                <div className="kpi-subtext">
                  {salesReport.reversed_count} reversed sale{salesReport.reversed_count !== 1 ? 's' : ''}
                </div>
              </div>
            </div>

            <div className="status-card">
              <div className="status-info">
                <h3>Gross Recorded Sales</h3>
                <p className="summary-total-val" style={{ color: 'var(--color-primary-light)' }}>
                  {paiseToRupees(salesReport.gross_revenue)}
                </p>
                <div className="kpi-subtext">
                  Confirmed + Reversed sales total
                </div>
              </div>
            </div>
          </div>

          {/* Daily Table */}
          <div className="card" style={{ marginTop: 'var(--space-md)' }}>
            <div className="card-header">
              <h3 className="card-title">Sales Breakdown by Day</h3>
              <span className="badge badge-info">{salesReport.days.length} Day{salesReport.days.length !== 1 ? 's' : ''}</span>
            </div>

            {salesReport.days.length === 0 ? (
              <div className="empty-state">
                <p>No confirmed sales found for the selected period.</p>
              </div>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th style={{ textAlign: 'center' }}>Confirmed Sales</th>
                      <th style={{ textAlign: 'right' }}>Net Confirmed Revenue</th>
                      <th style={{ textAlign: 'center' }}>Reversals</th>
                      <th style={{ textAlign: 'right' }}>Reversed Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesReport.days.map((d) => (
                      <tr key={d.date}>
                        <td style={{ fontWeight: 600 }}>{d.date}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="badge badge-success">{d.confirmed_count}</span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-success)' }}>
                          {paiseToRupees(d.net_revenue)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {d.reversed_count > 0 ? (
                            <span className="badge badge-danger">{d.reversed_count}</span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>0</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', color: d.reversed_revenue > 0 ? 'var(--color-warning)' : 'var(--text-muted)' }}>
                          {paiseToRupees(d.reversed_revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: PURCHASE REPORT */}
      {!loading && activeTab === 'purchases' && purchasesReport && (
        <div className="reports-tab-content">
          <div className="status-grid">
            <div className="status-card tone-info">
              <div className="status-info">
                <h3>Confirmed Net Expenditure</h3>
                <p className="summary-total-val" style={{ color: 'var(--color-info)' }}>
                  {paiseToRupees(purchasesReport.total_expenditure)}
                </p>
                <div className="kpi-subtext">
                  {purchasesReport.total_transactions} confirmed purchase transaction{purchasesReport.total_transactions !== 1 ? 's' : ''}
                </div>
              </div>
            </div>

            <div className="status-card tone-warning">
              <div className="status-info">
                <h3>Reversed Purchases</h3>
                <p className="summary-total-val" style={{ color: 'var(--color-warning)' }}>
                  {paiseToRupees(purchasesReport.reversed_expenditure)}
                </p>
                <div className="kpi-subtext">
                  {purchasesReport.reversed_count} reversed purchase{purchasesReport.reversed_count !== 1 ? 's' : ''}
                </div>
              </div>
            </div>

            <div className="status-card">
              <div className="status-info">
                <h3>Gross Recorded Purchases</h3>
                <p className="summary-total-val" style={{ color: 'var(--color-primary-light)' }}>
                  {paiseToRupees(purchasesReport.gross_expenditure)}
                </p>
                <div className="kpi-subtext">
                  Confirmed + Reversed purchases
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 'var(--space-md)' }}>
            <div className="card-header">
              <h3 className="card-title">Purchase Breakdown by Day</h3>
              <span className="badge badge-info">{purchasesReport.days.length} Day{purchasesReport.days.length !== 1 ? 's' : ''}</span>
            </div>

            {purchasesReport.days.length === 0 ? (
              <div className="empty-state">
                <p>No confirmed purchases found for the selected period.</p>
              </div>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th style={{ textAlign: 'center' }}>Confirmed Purchases</th>
                      <th style={{ textAlign: 'right' }}>Net Expenditure</th>
                      <th style={{ textAlign: 'center' }}>Reversals</th>
                      <th style={{ textAlign: 'right' }}>Reversed Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchasesReport.days.map((d) => (
                      <tr key={d.date}>
                        <td style={{ fontWeight: 600 }}>{d.date}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="badge badge-info">{d.confirmed_count}</span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-info)' }}>
                          {paiseToRupees(d.net_expenditure)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {d.reversed_count > 0 ? (
                            <span className="badge badge-danger">{d.reversed_count}</span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>0</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', color: d.reversed_expenditure > 0 ? 'var(--color-warning)' : 'var(--text-muted)' }}>
                          {paiseToRupees(d.reversed_expenditure)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: PRODUCT SALES REPORT */}
      {!loading && activeTab === 'product-sales' && productSalesReport && (
        <div className="reports-tab-content">
          <div className="status-grid">
            <div className="status-card tone-success">
              <div className="status-info">
                <h3>Total Product Sales Value</h3>
                <p className="summary-total-val" style={{ color: 'var(--color-success)' }}>
                  {paiseToRupees(productSalesReport.total_sales_value)}
                </p>
                <div className="kpi-subtext">Sum of authoritative item line totals</div>
              </div>
            </div>

            <div className="status-card">
              <div className="status-info">
                <h3>Active Products Sold</h3>
                <p className="summary-total-val" style={{ color: 'var(--color-primary-light)' }}>
                  {productSalesReport.total_products_sold}
                </p>
                <div className="kpi-subtext">Distinct catalog products with sales</div>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 'var(--space-md)' }}>
            <div className="card-header">
              <h3 className="card-title">Sales Performance by Product</h3>
              <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                <input
                  type="text"
                  placeholder="Filter product name or SKU..."
                  className="input-field"
                  style={{ width: '220px', padding: '6px 10px', fontSize: '0.82rem' }}
                  value={productQuery}
                  onChange={(e) => setProductQuery(e.target.value)}
                />
              </div>
            </div>

            {productSalesReport.items.length === 0 ? (
              <div className="empty-state">
                <p>No product sales recorded in the selected date range.</p>
              </div>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Category</th>
                      <th>Base Unit</th>
                      <th style={{ textAlign: 'right' }}>Net Quantity Sold</th>
                      <th style={{ textAlign: 'right' }}>Net Sales Value</th>
                      <th style={{ textAlign: 'center' }}>Transactions</th>
                      <th style={{ textAlign: 'right' }}>Reversed Sales</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productSalesReport.items
                      .filter((p) => {
                        if (!productQuery.trim()) return true
                        const q = productQuery.toLowerCase()
                        return (
                          p.product_name.toLowerCase().includes(q) ||
                          p.product_sku.toLowerCase().includes(q) ||
                          p.category.toLowerCase().includes(q)
                        )
                      })
                      .map((p) => (
                        <tr key={p.product_id}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{p.product_name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.product_sku}</div>
                          </td>
                          <td>
                            <span className="badge badge-info">{p.category || 'General'}</span>
                          </td>
                          <td style={{ color: 'var(--text-secondary)' }}>{p.base_unit}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>
                            {milliToQty(p.quantity_sold)} {p.base_unit}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-success)' }}>
                            {paiseToRupees(p.total_sales_value)}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className="badge badge-success">{p.transaction_count}</span>
                          </td>
                          <td style={{ textAlign: 'right', color: p.reversed_sales_value > 0 ? 'var(--color-warning)' : 'var(--text-muted)' }}>
                            {p.reversed_quantity > 0 && (
                              <div style={{ fontSize: '0.75rem' }}>
                                -{milliToQty(p.reversed_quantity)} {p.base_unit}
                              </div>
                            )}
                            <div>{paiseToRupees(p.reversed_sales_value)}</div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: INVENTORY SUMMARY REPORT */}
      {!loading && activeTab === 'inventory' && inventoryReport && (
        <div className="reports-tab-content">
          <div className="status-grid">
            <div className="status-card">
              <div className="status-info">
                <h3>Total Products</h3>
                <p className="summary-total-val" style={{ color: 'var(--text-primary)' }}>
                  {inventoryReport.total_products}
                </p>
                <div className="kpi-subtext">Active shop catalog items</div>
              </div>
            </div>

            <div className={`status-card ${inventoryReport.low_stock_count > 0 ? 'tone-danger' : 'tone-success'}`}>
              <div className="status-info">
                <h3>Low Stock Items</h3>
                <p className="summary-total-val" style={{ color: inventoryReport.low_stock_count > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                  {inventoryReport.low_stock_count}
                </p>
                <div className="kpi-subtext">At or below configured threshold</div>
              </div>
            </div>

            <div className="status-card tone-info">
              <div className="status-info">
                <h3>Inventory Cost Valuation</h3>
                <p className="summary-total-val" style={{ color: 'var(--color-info)' }}>
                  {paiseToRupees(inventoryReport.total_inventory_cost_value)}
                </p>
                <div className="kpi-subtext">At product purchase price</div>
              </div>
            </div>

            <div className="status-card tone-success">
              <div className="status-info">
                <h3>Inventory Selling Valuation</h3>
                <p className="summary-total-val" style={{ color: 'var(--color-success)' }}>
                  {paiseToRupees(inventoryReport.total_inventory_selling_value)}
                </p>
                <div className="kpi-subtext">At catalog selling price</div>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 'var(--space-md)' }}>
            <div className="card-header">
              <h3 className="card-title">Inventory Stock &amp; Audit Status</h3>
              <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={lowStockOnly}
                    onChange={(e) => setLowStockOnly(e.target.checked)}
                  />
                  <span>Low stock only</span>
                </label>
              </div>
            </div>

            {inventoryReport.items.length === 0 ? (
              <div className="empty-state">
                <p>No inventory records found.</p>
              </div>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Category</th>
                      <th style={{ textAlign: 'right' }}>Current Stock</th>
                      <th style={{ textAlign: 'right' }}>Threshold</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Inflows</th>
                      <th style={{ textAlign: 'right' }}>Outflows</th>
                      <th style={{ textAlign: 'center' }}>Audit Ledger</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryReport.items.map((item) => (
                      <tr key={item.product_id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{item.name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.sku}</div>
                        </td>
                        <td>
                          <span className="badge badge-info">{item.category || 'General'}</span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>
                          {milliToQty(item.stock_qty)} {item.base_unit}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>
                          {milliToQty(item.low_stock_threshold)} {item.base_unit}
                        </td>
                        <td>
                          {item.is_low_stock ? (
                            <span className="badge badge-danger">Low Stock</span>
                          ) : (
                            <span className="badge badge-success">Sufficient</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--color-success)', fontSize: '0.82rem' }}>
                          +{milliToQty(item.total_inflow)} {item.base_unit}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--color-danger)', fontSize: '0.82rem' }}>
                          -{milliToQty(item.total_outflow)} {item.base_unit}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-outline"
                            style={{ padding: '4px 10px', fontSize: '0.76rem' }}
                            onClick={() => openMovements({ id: item.product_id, name: item.name })}
                          >
                            View Movements →
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
      )}

      {/* TAB 5: RECONCILIATION & AUDIT REPORT */}
      {!loading && activeTab === 'reconciliation' && reconciliationReport && (
        <div className="reports-tab-content">
          <div className="status-grid">
            <div className="status-card">
              <div className="status-info">
                <h3>Total Checked</h3>
                <p className="summary-total-val" style={{ color: 'var(--text-primary)' }}>
                  {reconciliationReport.summary.total_products_checked}
                </p>
                <div className="kpi-subtext">Catalog products audited</div>
              </div>
            </div>

            <div className="status-card tone-success">
              <div className="status-info">
                <h3>Reconciled</h3>
                <p className="summary-total-val" style={{ color: 'var(--color-success)' }}>
                  {reconciliationReport.summary.reconciled_count}
                </p>
                <div className="kpi-subtext">Verified 100% continuous and balanced</div>
              </div>
            </div>

            <div className={`status-card ${reconciliationReport.summary.discrepancy_count > 0 ? 'tone-danger' : ''}`}>
              <div className="status-info">
                <h3>Discrepancies</h3>
                <p className="summary-total-val" style={{ color: reconciliationReport.summary.discrepancy_count > 0 ? 'var(--color-danger)' : 'var(--text-muted)' }}>
                  {reconciliationReport.summary.discrepancy_count}
                </p>
                <div className="kpi-subtext">Unrecorded or mismatched stock</div>
              </div>
            </div>

            <div className={`status-card ${reconciliationReport.summary.gap_detected_count > 0 ? 'tone-danger' : ''}`}>
              <div className="status-info">
                <h3>Chain Gaps</h3>
                <p className="summary-total-val" style={{ color: reconciliationReport.summary.gap_detected_count > 0 ? 'var(--color-danger)' : 'var(--text-muted)' }}>
                  {reconciliationReport.summary.gap_detected_count}
                </p>
                <div className="kpi-subtext">Discontinuity between movement steps</div>
              </div>
            </div>

            <div className="status-card tone-warning">
              <div className="status-info">
                <h3>No Movements</h3>
                <p className="summary-total-val" style={{ color: 'var(--color-warning)' }}>
                  {reconciliationReport.summary.no_movements_count}
                </p>
                <div className="kpi-subtext">Created with 0 opening stock</div>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 'var(--space-md)' }}>
            <div className="card-header">
              <div>
                <h3 className="card-title">Stock Ledger Mathematical Reconciliation</h3>
                <p className="placeholder-copy" style={{ fontSize: '0.8rem', marginTop: '2px' }}>
                  Audits whether catalog stock matches the movement ledger: initial adjustment + ∑(purchases - sales + reversals).
                </p>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                <select
                  className="input-field select-field"
                  style={{ padding: '6px 10px', fontSize: '0.82rem' }}
                  value={reconStatusFilter}
                  onChange={(e) => setReconStatusFilter(e.target.value)}
                >
                  <option value="all">All statuses</option>
                  <option value="discrepancy">Discrepancies only</option>
                  <option value="gap_detected">Chain gaps only</option>
                  <option value="reconciled">Reconciled only</option>
                  <option value="no_movements">No movements</option>
                </select>
              </div>
            </div>

            {reconciliationReport.items.length === 0 ? (
              <div className="empty-state">
                <p>No products available to reconcile.</p>
              </div>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th style={{ textAlign: 'right' }}>Catalog Stock</th>
                      <th style={{ textAlign: 'right' }}>Ledger Calculated</th>
                      <th style={{ textAlign: 'right' }}>Discrepancy (Δ)</th>
                      <th style={{ textAlign: 'center' }}>Movements</th>
                      <th>Status</th>
                      <th>Audit Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reconciliationReport.items
                      .filter((it) => {
                        if (reconStatusFilter === 'all') return true
                        return it.status === reconStatusFilter
                      })
                      .map((item) => {
                        const statusObj = formatReconciliationStatus(item.status)
                        return (
                          <tr key={item.product_id}>
                            <td>
                              <div style={{ fontWeight: 600 }}>{item.product_name}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.product_sku}</div>
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>
                              {milliToQty(item.recorded_stock)} {item.base_unit}
                            </td>
                            <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                              {milliToQty(item.calculated_stock)} {item.base_unit}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: item.discrepancy !== 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                              {item.discrepancy === 0 ? (
                                '0'
                              ) : (
                                `${item.discrepancy > 0 ? '+' : ''}${milliToQty(item.discrepancy)} ${item.base_unit}`
                              )}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span className="badge badge-info">{item.movements_count}</span>
                            </td>
                            <td>
                              <span className={`badge badge-${statusObj.tone}`}>{statusObj.label}</span>
                            </td>
                            <td style={{ maxWidth: '300px' }}>
                              {item.issues && item.issues.length > 0 ? (
                                <div className="audit-issues-list">
                                  {item.issues.map((iss, i) => (
                                    <div key={i} className="audit-issue-item">
                                      ⚠️ {iss}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span style={{ color: 'var(--color-success)', fontSize: '0.8rem' }}>
                                  ✓ Mathematical audit verified
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MOVEMENTS MODAL */}
      {movementsModal && (
        <div className="modal-backdrop" onClick={() => setMovementsModal(null)}>
          <div
            className="modal-content"
            style={{ maxWidth: '850px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 className="modal-title">
                Inventory Movement Audit Trail — {movementsModal.name}
              </h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setMovementsModal(null)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              {movementsLoading ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
                  <div className="spinner" style={{ margin: '0 auto var(--space-md)' }} />
                  <p className="placeholder-copy">Loading movement audit records...</p>
                </div>
              ) : movementsData.length === 0 ? (
                <div className="empty-state">
                  <p>No inventory movements recorded for this product.</p>
                </div>
              ) : (
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Movement ID</th>
                        <th>Timestamp</th>
                        <th>Type</th>
                        <th style={{ textAlign: 'right' }}>Stock Before</th>
                        <th style={{ textAlign: 'right' }}>Quantity Delta</th>
                        <th style={{ textAlign: 'right' }}>Stock After</th>
                        <th style={{ textAlign: 'center' }}>Transaction</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movementsData.map((m) => {
                        const mType = formatMovementType(m.movement_type)
                        return (
                          <tr key={m.id}>
                            <td style={{ fontFamily: 'monospace' }}>#{m.id}</td>
                            <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{m.created_at}</td>
                            <td>
                              <span className={`badge badge-${mType.tone}`}>{mType.label}</span>
                            </td>
                            <td style={{ textAlign: 'right' }}>{milliToQty(m.stock_before)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: m.quantity_change > 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                              {m.quantity_change > 0 ? `+${milliToQty(m.quantity_change)}` : milliToQty(m.quantity_change)}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 700 }}>{milliToQty(m.stock_after)}</td>
                            <td style={{ textAlign: 'center', fontFamily: 'monospace', color: 'var(--color-primary-light)' }}>
                              {m.transaction_id ? `#${m.transaction_id}` : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setMovementsModal(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
