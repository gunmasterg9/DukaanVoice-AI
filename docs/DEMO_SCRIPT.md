# DukaanVoice AI - End-to-End Demo Script & Walkthrough

**Target Audience:** Evaluators, shopkeepers, reviewers, and hackathon judges.  
**Estimated Walkthrough Time:** 5 to 7 minutes.  
**Prerequisites:** DukaanVoice AI running on `http://127.0.0.1:5173` (via `run.bat`).  

---

## Scenario: A Typical Day at "Shree Krishna Kirana Store"

This demo walks through a realistic daily operational cycle of an Indian retail shopkeeper:
1. Opening the shop in the morning in the shopkeeper's regional language.
2. Adding a new kirana item without needing a barcode or SKU.
3. Making a rapid POS sale with cash payment and printing a thermal receipt.
4. Managing customer credit (Udhaar Khata) and generating a shareable WhatsApp statement.
5. Recording daily shop operating expenses.
6. Performing end-of-day cash drawer reconciliation and locking the daily cash closing.
7. Viewing business analytics and mathematical stock continuity.

---

## Step 1: Launch and Choose Your Mother Tongue

1. Open your browser and navigate to `http://127.0.0.1:5173` (or double-click `run.bat`).
2. Look at the top right header navigation bar. Click the **Language Selector** (globe icon).
3. Search or click on **ગુજરાતી (Gujarati)**, **हिन्दी (Hindi)**, **தமிழ் (Tamil)**, or **اُردُو (Urdu)**.
4. Notice how:
   - All navigation tabs, metric cards, action buttons, and form labels immediately adapt to the chosen language.
   - If **Urdu** (`ur`), **Kashmiri** (`ks`), or **Sindhi** (`sd`) is selected, the entire UI layout smoothly mirrors into **Right-to-Left (RTL)** mode.

---

## Step 2: Quick Product Creation (No SKU Needed)

1. Click on the **Products** tab.
2. Click **"+ Add Product"** (or "+ નવું ઉત્પાદન").
3. Notice that **SKU Code** is clearly marked as `(Optional)` — a small shopkeeper doesn't need to assign barcodes for loose items!
4. Fill in:
   - **Product Name:** `Tata Tea Gold 250g`
   - **Category:** `Groceries` (or `કરિયાણું`)
   - **Base Unit:** `packet`
   - **Cost Price (₹):** `110.00`
   - **Selling Price (₹):** `135.00`
   - **Opening Stock:** `20`
5. Click **"Save Product"**.
6. The product appears instantly in the catalog with 20 packets in stock and zero SKU errors.

---

## Step 3: Quick Sale POS & Thermal Receipt

1. Click on the **Quick Sale** tab.
2. In the search box, start typing `Tata` or click on any product card in the grid.
3. Click the item to add it to the active cart.
4. Increase the quantity to `2 packets`.
5. Notice the live total calculation: `₹270.00`.
6. Select **Cash** as the payment method.
7. Click **"Review Sale"** (or "સમીક્ષા કરો"):
   - A modal appears showing the line items, unit prices, quantity, and total amount.
   - This provides the critical review guardrail before committing inventory.
8. Click **"Confirm & Complete Sale"**:
   - The transaction commits atomically.
   - Inventory is immediately reduced from 20 to 18 packets.
   - A thermal receipt preview appears with shop details, receipt number, items, and paid status.
   - Click **"Print Receipt"** to view the clean 80mm/A4 print-ready layout.

---

## Step 4: Customer Udhaar Khata (Credit Sale, Repayment & WhatsApp Statement)

1. Return to **Quick Sale** and add another item (e.g., `1 packet` of tea = `₹135.00`).
2. In the payment tender selector, choose **Credit (Udhaar)**.
3. Select or enter customer name: `Ramesh Patel` (Mobile: `9876543210`).
4. Click **"Review Sale"** and **"Confirm & Complete Sale"**.
5. Navigate to the **Udhaar Khata** tab:
   - See `Ramesh Patel` listed with an outstanding balance of `₹135.00`.
6. Click **"Record Payment"** (or "ચુકવણી નોંધો"):
   - Amount: `₹50.00`
   - Payment Method: `Cash`
   - Note: `Partial repayment`
   - Click **"Confirm Payment"**.
   - Notice the outstanding balance updates immediately from ₹135.00 to `₹85.00`.
7. Click **"Statement"** (or "ખાતાવહી સ્ટેટમેન્ટ"):
   - View the date-filtered debit/credit ledger breakdown.
   - Click **"Share via WhatsApp"**: A localized, professional balance reminder is copied to your clipboard ready to send to the customer!
   - Click **"Print Statement"** to view the printable ledger record.

---

## Step 5: Recording Shop Operating Expenses

1. Click on the **Expenses** tab.
2. Notice the top summary tiles displaying total shop outlays, cash-paid expenses, and bank/UPI expenses.
3. Click **"+ Add Expense"**:
   - **Amount (₹):** `35.00`
   - **Category:** `Tea & Refreshments`
   - **Payment Method:** `Cash`
   - **Notes:** `Evening chai for customers`
4. Click **"Save Expense"**.
5. The cash expense is logged with its timestamp and classified as a cash outlay that reduces the cash drawer balance.

---

## Step 6: Daily Cash Closing & Drawer Reconciliation

1. At the end of the business day, click on the **Cash Closing** tab.
2. Select today's date (defaults to today).
3. Review the system calculation breakdown:
   - **Opening Cash:** e.g., `₹500.00`
   - **Cash Sales:** `+ ₹270.00` (from Step 3)
   - **Cash Repayments:** `+ ₹50.00` (from Step 4)
   - **Cash Expenses:** `- ₹35.00` (from Step 5)
   - **Expected Closing Cash:** `₹785.00`
   - *(Notice that UPI sales and unpaid credit sales are strictly excluded from the physical cash drawer!)*
4. Enter the **Actual Physical Cash Counted** in your drawer:
   - Enter `785.00`. The difference badge shows `₹0.00 (Balanced)` in green!
   - (Or enter `780.00` to simulate a `₹5.00 Shortage`, prompting an explanatory note).
5. Click **"Lock & Finalize Closing"**:
   - A confirmation dialog appears explaining that finalizing will lock the day's record to prevent retroactive tampering.
   - Click **"Confirm & Lock"**.
   - The status changes to **Finalized (Locked)** and appears in the permanent closing history log below!

---

## Step 7: Business Reports & Inventory Continuity Audit

1. Click on the **Reports** tab.
2. Review the **Daily Summary**:
   - Total sales revenue, gross transaction count, cash vs digital split.
3. Review the **Product Sales & Inventory Valuation**:
   - Real-time stock valuation at cost price vs selling value.
4. Review the **Reconciliation** sub-tab:
   - Shows mathematical ledger proof: `Opening Stock + Purchases - Sales ± Adjustments == Current Stock`.
   - Every movement is audited without missing items.

---

## Summary of Evaluator Takeaways
- **No Fluff:** Solves the real, daily problems of a busy Indian retailer.
- **Financial Precision:** 100% integer arithmetic in paise — never floating point.
- **True Mother-Tongue Accessibility:** Seamlessly operates in 22 Indian languages with RTL layout.
- **Rock-Solid Reliability:** Powered by SQLite transactions and validated by 122 automated unit/integration tests plus 2 isolated E2E scenario suites.
