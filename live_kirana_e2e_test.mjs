const API = 'http://127.0.0.1:8000/api';

async function testKirana() {
  console.log('--- 1. Health & Schema Version 3 Check ---');
  const hRes = await fetch(`${API}/health/ready`);
  const health = await hRes.json();
  console.log('Ready check:', health.status, 'Schema version:', health.schema_version);
  if (health.schema_version !== 3) throw new Error('Schema version should be 3');

  console.log('--- 2. Quick Product Entry (Optional SKU & 0 Purchase Price) ---');
  const pRes = await fetch(`${API}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `Parle-G Gold ${Date.now()}`,
      selling_price: 1000, // Rs 10.00
      opening_stock: 50000, // 50 units
      base_unit: 'piece'
    })
  });
  const product = await pRes.json();
  console.log('Created product:', product.id, product.name, 'SKU:', product.sku, 'Purchase price:', product.purchase_price);
  if (product.sku !== null) throw new Error('SKU should be null');

  console.log('--- 3. Create Customer for Udhaar Khata ---');
  const cRes = await fetch(`${API}/customers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `Kishore Bhai ${Date.now()}`,
      phone: '9825099887',
      address: 'Shop 12, Main Bazar'
    })
  });
  const customer = await cRes.json();
  console.log('Created customer:', customer.id, customer.name, 'Balance:', customer.current_balance);
  if (customer.current_balance !== 0) throw new Error('Initial balance should be 0');

  console.log('--- 4. Quick POS Sale with Credit (Udhaar) ---');
  const txDraftRes = await fetch(`${API}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'sale',
      payment_method: 'credit',
      customer_id: customer.id,
      items: [{
        product_id: product.id,
        quantity: 5000, // 5 pieces
        unit: 'piece',
        unit_price: 1000 // Rs 10.00
      }]
    })
  });
  const draftTx = await txDraftRes.json();
  console.log('Draft Sale Tx:', draftTx.id, 'Payment method:', draftTx.payment_method, 'Customer:', draftTx.customer_name, 'Total:', draftTx.total_amount);
  if (draftTx.total_amount !== 5000) throw new Error('Draft total should be 5000 paise (Rs 50.00)');

  console.log('--- 5. Confirm Transaction & Audit Customer Ledger ---');
  const confRes = await fetch(`${API}/transactions/${draftTx.id}/confirm`, { method: 'PATCH' });
  const confTx = await confRes.json();
  console.log('Confirmed Tx status:', confTx.status);

  // Check customer's ledger
  const custDetailRes = await fetch(`${API}/customers/${customer.id}`);
  const custDetail = await custDetailRes.json();
  console.log('Customer balance after credit sale:', custDetail.current_balance, 'paise');
  console.log('Ledger entries count:', custDetail.ledger.length);
  const saleEntry = custDetail.ledger[0];
  console.log('Latest ledger entry:', saleEntry.entry_type, 'Amount:', saleEntry.amount, 'Balance after:', saleEntry.balance_after);
  if (custDetail.current_balance !== 5000) throw new Error('Customer balance should be 5000 paise');

  console.log('--- 6. Record Customer Payment (Jama) via UPI ---');
  const payRes = await fetch(`${API}/customers/${customer.id}/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: 2000, // Rs 20.00
      payment_mode: 'upi',
      notes: 'UPI payment received via GPay'
    })
  });
  const afterPayment = await payRes.json();
  console.log('Balance after Rs 20 payment:', afterPayment.current_balance, 'paise (expected: 3000)');
  console.log('Ledger count after payment:', afterPayment.ledger.length);
  if (afterPayment.current_balance !== 3000) throw new Error('Customer balance should be 3000 paise');

  console.log('--- 7. Low-Stock Reorder Draft Preparation ---');
  // Create a low-stock product
  const lowP = await (await fetch(`${API}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `Moong Dal 500g ${Date.now()}`,
      selling_price: 6000,
      purchase_price: 5000,
      opening_stock: 1000, // 1 unit (low stock!)
      low_stock_threshold: 10000, // 10 units threshold
      base_unit: 'piece'
    })
  })).json();

  const reorderRes = await fetch(`${API}/products/reorder-draft`, { method: 'POST' });
  const reorderDraft = await reorderRes.json();
  console.log('Prepared purchase reorder draft #:', reorderDraft.id, 'Items count:', reorderDraft.items.length, 'Type:', reorderDraft.type);
  if (reorderDraft.type !== 'purchase' || reorderDraft.status !== 'draft') {
    throw new Error('Reorder draft must be a purchase draft');
  }

  console.log('\n>>> ALL LIVE KIRANA E2E VERIFICATIONS PASSED SUCCESSFULLY! <<<');
}

testKirana().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
