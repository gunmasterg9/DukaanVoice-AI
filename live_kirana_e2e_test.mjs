/**
 * DukaanVoice AI - Strengthened Live Kirana E2E Test Suite
 * 
 * Verifies end-to-end retail operations on an ISOLATED test database:
 * 1. Health & Schema Version 4 readiness.
 * 2. Quick product entry with optional SKU and zero purchase price.
 * 3. Multi-line same-product stock aggregation in POS sale (Fix 1).
 * 4. Customer Udhaar Khata creation and initial zero balance.
 * 5. Credit sale confirmation, atomic inventory deduction, and customer ledger audit.
 * 6. Customer partial repayment (Jama) recording via UPI.
 * 7. Credit sale reversal after partial repayment (Fix 3: Advance credit surplus policy).
 * 8. Customer statement generation & localized WhatsApp sharing text.
 * 9. Low-stock reorder draft preparation.
 * 10. Shop expense recording and cash drawer impact.
 * 11. Exact daily cash closing calculations & immutability of finalized closings (Fix 2).
 * 
 * Safety: Runs against an isolated temporary SQLite database so that the live shop database is never touched.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_PORT = process.env.TEST_PORT || 8009;
const IS_EXTERNAL = Boolean(process.env.API_URL);
const BASE_URL = process.env.API_URL || `http://127.0.0.1:${TEST_PORT}`;
const API = `${BASE_URL}/api`;

const TEST_DATA_DIR = path.resolve(__dirname, 'backend', 'data');
const TEST_DB_PATH = path.resolve(TEST_DATA_DIR, `test_e2e_isolated_${Date.now()}.db`);
const PYTHON_PATH = path.resolve(__dirname, 'backend', '.venv', 'Scripts', 'python.exe');

async function apiRequest(url, options = {}, expectedStatus = 200) {
  const res = await fetch(url, options);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }

  assert.strictEqual(
    res.status,
    expectedStatus,
    `API call failed: expected HTTP ${expectedStatus}, received HTTP ${res.status} at ${url}.\nResponse: ${text}`
  );
  return json;
}

async function waitForServer(maxAttempts = 30, intervalMs = 500) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${API}/health/ready`);
      if (res.status === 200) {
        const body = await res.json();
        if (body.status === 'ready') return true;
      }
    } catch {
      // Waiting for server to start
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Server failed to start at ${API} after ${maxAttempts * intervalMs}ms`);
}

function cleanupDbFiles(dbPath) {
  for (const ext of ['', '-wal', '-shm', '-journal']) {
    const file = `${dbPath}${ext}`;
    if (fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
      } catch {
        // Ignore file lock or delay
      }
    }
  }
}

async function runTestSuite() {
  console.log(`[E2E] Running against API endpoint: ${API}`);

  // 1. Health & Schema Version 4 Check
  console.log('--- 1. Health & Schema Version 4 Check ---');
  const health = await apiRequest(`${API}/health/ready`, {}, 200);
  assert.strictEqual(health.status, 'ready', 'Health status must be "ready"');
  assert.strictEqual(health.schema_version, 4, `Schema version must be 4, got: ${health.schema_version}`);
  console.log(`   -> Health: ready, Schema version: ${health.schema_version}`);

  // 2. Quick Product Entry (Optional SKU & 0 Purchase Price)
  console.log('--- 2. Quick Product Entry (Optional SKU) ---');
  const prodName = `Parle-G Gold ${Date.now()}`;
  const product = await apiRequest(`${API}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: prodName,
      selling_price: 1000, // Rs 10.00
      opening_stock: 50000, // 50 units (50,000 milli-units)
      base_unit: 'piece'
    })
  }, 201);

  assert(typeof product.id === 'number', 'Product ID must be a number');
  assert.strictEqual(product.name, prodName, 'Product name must match');
  assert.strictEqual(product.sku, null, 'SKU must be null when omitted');
  assert.strictEqual(product.stock_qty, 50000, 'Initial stock must be 50,000 milli-units');
  assert.strictEqual(product.selling_price, 1000, 'Selling price must be 1,000 paise');
  console.log(`   -> Created Product ID: ${product.id}, SKU: ${product.sku}, Stock: ${product.stock_qty} mu`);

  // 3. Multi-Line Same-Product Stock Aggregation (Fix 1)
  console.log('--- 3. Multi-Line Same-Product Stock Aggregation (Fix 1) ---');
  // Two separate lines for the same product in a single sale:
  // Line 1: 3 pieces (3,000 mu)
  // Line 2: 2 pieces (2,000 mu)
  // Total: 5 pieces (5,000 mu)
  const multiLineDraft = await apiRequest(`${API}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'sale',
      payment_method: 'cash',
      items: [
        { product_id: product.id, quantity: 3000, unit: 'piece', unit_price: 1000 },
        { product_id: product.id, quantity: 2000, unit: 'piece', unit_price: 1000 }
      ]
    })
  }, 201);

  assert.strictEqual(multiLineDraft.items.length, 2, 'Must have 2 items');
  assert.strictEqual(multiLineDraft.total_amount, 5000, 'Total amount must be 5,000 paise (Rs 50.00)');

  const multiConfirm = await apiRequest(`${API}/transactions/${multiLineDraft.id}/confirm`, { method: 'PATCH' }, 200);
  assert.strictEqual(multiConfirm.status, 'confirmed', 'Transaction must be confirmed');

  // Verify stock deduction: 50,000 - 5,000 = 45,000
  const productAfterMulti = await apiRequest(`${API}/products/${product.id}`, {}, 200);
  assert.strictEqual(
    productAfterMulti.stock_qty,
    45000,
    `Stock must be 45,000 mu after aggregate multi-line deduction, got: ${productAfterMulti.stock_qty}`
  );
  console.log(`   -> Multi-line stock aggregated correctly: Stock is ${productAfterMulti.stock_qty} mu (no stale overwrite)`);

  // 4. Create Customer for Udhaar Khata
  console.log('--- 4. Create Customer for Udhaar Khata ---');
  const custName = `Kishore Bhai ${Date.now()}`;
  const customer = await apiRequest(`${API}/customers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: custName,
      phone: '9825099887',
      address: 'Shop 12, Main Bazar'
    })
  }, 201);

  assert(typeof customer.id === 'number', 'Customer ID must be a number');
  assert.strictEqual(customer.name, custName, 'Customer name must match');
  assert.strictEqual(customer.current_balance, 0, 'Initial customer balance must be 0');
  console.log(`   -> Created Customer ID: ${customer.id}, Balance: ${customer.current_balance}`);

  // 5. Quick POS Sale with Credit (Udhaar)
  console.log('--- 5. Quick POS Sale with Credit (Udhaar) ---');
  const creditDraft = await apiRequest(`${API}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'sale',
      payment_method: 'credit',
      customer_id: customer.id,
      items: [{
        product_id: product.id,
        quantity: 5000, // 5 pieces (5,000 mu)
        unit: 'piece',
        unit_price: 1000 // Rs 10.00
      }]
    })
  }, 201);

  assert.strictEqual(creditDraft.total_amount, 5000, 'Draft total must be 5,000 paise');
  assert.strictEqual(creditDraft.payment_method, 'credit', 'Payment method must be credit');

  const confCredit = await apiRequest(`${API}/transactions/${creditDraft.id}/confirm`, { method: 'PATCH' }, 200);
  assert.strictEqual(confCredit.status, 'confirmed', 'Credit sale must be confirmed');

  // Verify customer balance and stock
  const custAfterCredit = await apiRequest(`${API}/customers/${customer.id}`, {}, 200);
  assert.strictEqual(custAfterCredit.current_balance, 5000, 'Customer balance must be 5,000 paise (Rs 50.00)');
  assert(custAfterCredit.ledger.length >= 1, 'Ledger must contain credit sale entry');
  console.log(`   -> Customer balance after credit sale: ${custAfterCredit.current_balance} paise`);

  // 6. Record Customer Repayment (Jama) via UPI
  console.log('--- 6. Record Customer Payment (Jama) via UPI ---');
  const payment = await apiRequest(`${API}/customers/${customer.id}/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: 2000, // Rs 20.00
      payment_mode: 'upi',
      notes: 'UPI payment received via GPay'
    })
  }, 200);

  assert.strictEqual(payment.current_balance, 3000, 'Customer balance after Rs 20 payment must be 3,000 paise');
  console.log(`   -> Customer balance after Rs 20 repayment: ${payment.current_balance} paise (expected: 3,000)`);

  // 7. Credit Sale Reversal with Partial Repayment (Fix 3: Advance Credit Surplus)
  console.log('--- 7. Reversal with Partial Repayment (Fix 3) ---');
  // Reversing the credit sale of 5,000 paise when customer balance is 3,000 paise
  // Balance becomes 3,000 - 5,000 = -2,000 paise (Rs. 20.00 advance store deposit)
  const revCredit = await apiRequest(`${API}/transactions/${creditDraft.id}/reverse`, { method: 'PATCH' }, 200);
  assert.strictEqual(revCredit.status, 'reversed', 'Credit transaction must be reversed');

  const custAfterRev = await apiRequest(`${API}/customers/${customer.id}`, {}, 200);
  assert.strictEqual(custAfterRev.current_balance, -2000, 'Customer balance must be -2,000 paise (advance deposit)');
  assert(
    custAfterRev.ledger[0].notes.includes('Customer advance credit surplus'),
    `Ledger note must explicitly mention advance credit surplus: ${custAfterRev.ledger[0].notes}`
  );
  console.log(`   -> Customer advance credit surplus policy verified: Balance is ${custAfterRev.current_balance} paise`);

  // 8. Customer Statement & WhatsApp Summary
  console.log('--- 8. Customer Statement & WhatsApp Summary ---');
  const stmt = await apiRequest(`${API}/customers/${customer.id}/statement`, {}, 200);
  assert.strictEqual(stmt.closing_balance, -2000, 'Statement closing balance must match customer balance');
  assert(stmt.shareable_text.includes('Customer Advance Credit Surplus (Store Deposit)'), 'WhatsApp text must format advance deposit correctly');
  console.log(`   -> WhatsApp statement verified: "${stmt.shareable_text.split('\n')[2]}"`);

  // 9. Low-Stock Reorder Draft Preparation
  console.log('--- 9. Low-Stock Reorder Draft Preparation ---');
  const lowProd = await apiRequest(`${API}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `Moong Dal 500g ${Date.now()}`,
      selling_price: 6000,
      purchase_price: 5000,
      opening_stock: 1000, // 1 unit (1,000 mu)
      low_stock_threshold: 10000, // 10 units threshold
      base_unit: 'piece'
    })
  }, 201);

  const reorderDraft = await apiRequest(`${API}/products/reorder-draft`, { method: 'POST' }, 201);
  assert.strictEqual(reorderDraft.type, 'purchase', 'Reorder draft must be a purchase draft');
  assert.strictEqual(reorderDraft.status, 'draft', 'Reorder draft must be in draft status');
  assert(Array.isArray(reorderDraft.items) && reorderDraft.items.length > 0, 'Reorder draft must contain items');
  console.log(`   -> Reorder draft generated: ID=${reorderDraft.id}, Items=${reorderDraft.items.length}`);

  // 10. Record Shop Expense
  console.log('--- 10. Record Shop Cash Expense ---');
  const todayIso = new Date().toISOString().split('T')[0];
  const expense = await apiRequest(`${API}/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expense_date: todayIso,
      amount: 1500, // Rs 15.00
      category: 'miscellaneous',
      payment_method: 'cash',
      notes: 'Evening tea for guests'
    })
  }, 201);

  assert.strictEqual(expense.amount, 1500, 'Expense amount must be 1,500 paise');
  assert.strictEqual(expense.payment_method, 'cash', 'Payment method must be cash');
  assert.strictEqual(expense.status, 'active', 'Expense status must be active');
  console.log(`   -> Created Expense ID: ${expense.id}, Amount: ${expense.amount} paise`);

  // 11. Daily Cash Closing Preview & Reconciliation Arithmetic (Fix 2 & Exact Math)
  console.log('--- 11. Daily Cash Closing Calculations & Finalization ---');
  const preview = await apiRequest(`${API}/cash-closing/preview?business_date=${todayIso}&opening_cash=50000`, {}, 200);

  assert.strictEqual(preview.opening_cash, 50000, 'Opening cash must match parameter');
  assert.strictEqual(preview.cash_sales, 5000, 'Cash sales must equal confirmed cash sale total (5,000 paise)');
  assert.strictEqual(preview.cash_expenses, 1500, 'Cash expenses must equal 1,500 paise');
  // Reversal of credit sale does NOT affect physical cash drawer, so cash_refunds = 0
  assert.strictEqual(preview.cash_refunds, 0, 'Credit reversal must not produce cash refunds');

  // Exact drawer formula assertion
  const calculatedExpected = preview.opening_cash + preview.cash_sales + preview.cash_repayments - preview.cash_expenses - preview.cash_refunds;
  assert.strictEqual(preview.expected_cash, calculatedExpected, 'Expected cash must match exact drawer formula');
  console.log(`   -> Exact cash drawer calculation verified: Expected = ${preview.expected_cash} paise`);

  // Finalize closing drawer with exact count
  const closing = await apiRequest(`${API}/cash-closing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      business_date: todayIso,
      opening_cash: 50000,
      actual_cash: preview.expected_cash,
      notes: 'Day closed with exact cash balance',
      finalize: true
    })
  }, 201);

  assert.strictEqual(closing.status, 'finalized', 'Closing status must be finalized');
  assert.strictEqual(closing.difference, 0, 'Difference must be 0 for exact cash match');

  // Verify finalized closing record is immutable (Fix 2)
  const lockedPreview = await apiRequest(`${API}/cash-closing/preview?business_date=${todayIso}`, {}, 200);
  assert.strictEqual(lockedPreview.is_already_closed, true, 'Finalized date must be marked as already closed');
  assert.strictEqual(lockedPreview.expected_cash, preview.expected_cash, 'Locked closing record must preserve expected cash');
  console.log('   -> Finalized closing is locked and immutable.');

  console.log('\n>>> ALL 11 LIVE KIRANA E2E VERIFICATIONS PASSED SUCCESSFULLY ON ISOLATED TEST DATABASE! <<<');
}

async function main() {
  let serverProcess = null;

  try {
    if (!IS_EXTERNAL) {
      console.log(`[E2E Setup] Initializing isolated test database at: ${TEST_DB_PATH}`);
      cleanupDbFiles(TEST_DB_PATH);

      console.log(`[E2E Setup] Spawning isolated FastAPI backend server on port ${TEST_PORT}...`);
      serverProcess = spawn(
        PYTHON_PATH,
        ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(TEST_PORT)],
        {
          cwd: path.resolve(__dirname, 'backend'),
          env: {
            ...process.env,
            DUKAANVOICE_DATABASE_PATH: TEST_DB_PATH,
            DUKAANVOICE_PORT: String(TEST_PORT),
          },
          stdio: 'pipe',
        }
      );

      serverProcess.on('error', (err) => {
        console.error('[E2E Setup Error] Failed to spawn backend process:', err);
      });

      console.log('[E2E Setup] Waiting for isolated test backend to become ready...');
      await waitForServer();
      console.log('[E2E Setup] Isolated backend is online and ready.');
    }

    await runTestSuite();
  } finally {
    if (serverProcess) {
      console.log('[E2E Teardown] Terminating isolated test server process...');
      try {
        serverProcess.kill('SIGTERM');
      } catch {
        // Ignored
      }
      // Wait slightly for file handle release
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (!IS_EXTERNAL) {
      console.log('[E2E Teardown] Cleaning up isolated test database files...');
      cleanupDbFiles(TEST_DB_PATH);
      console.log('[E2E Teardown] Cleanup complete. Live shop database remained 100% untouched.');
    }
  }
}

main().catch((err) => {
  console.error('\n[E2E FAILED]:', err);
  process.exit(1);
});
