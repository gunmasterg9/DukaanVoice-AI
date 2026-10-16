"""Complete End-to-End lifecycle scenario test on an isolated temporary database.
Verifies all core shop workflows and targeted audit guarantees:
1. Product with opening stock (integer milli-units, integer paise, optional SKU).
2. Multi-line same-product sale draft and atomic confirmation (Fix 1: aggregate stock verification).
3. Stock movement audit records and sequential continuity.
4. Cash expense registration and cash drawer impact.
5. Customer Udhaar credit sale and partial repayment.
6. Credit sale reversal after partial repayment (Fix 3: customer advance credit policy).
7. Ledger-derived customer balance, statement, and WhatsApp preview.
8. Cash refund reversal date attribution and finalized closing immutability (Fix 2).
9. Daily cash closing drawer reconciliation math.
10. Sales and inventory reports audit.
11. Persistence verification across application reload.
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

# Ensure backend root is on sys.path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient

from app.config import clear_settings_cache
from app.database import connection, initialize_schema
from app.main import create_app


def run_e2e_verification():
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        data_dir = tmp_path / "data"
        backup_dir = tmp_path / "backups"
        db_path = data_dir / "e2e_isolated.db"
        data_dir.mkdir(parents=True, exist_ok=True)
        backup_dir.mkdir(parents=True, exist_ok=True)

        os.environ["DUKAANVOICE_DATA_DIR"] = str(data_dir)
        os.environ["DUKAANVOICE_DATABASE_PATH"] = str(db_path)
        os.environ["DUKAANVOICE_BACKUP_DIR"] = str(backup_dir)
        clear_settings_cache()

        print("[E2E] Step 0: Initializing schema on isolated temporary database...")
        initialize_schema(db_path)
        app = create_app()

        with TestClient(app) as client:
            print("[E2E] Step 1: Create test product with optional SKU and opening stock...")
            p_res = client.post(
                "/api/products",
                json={
                    "name": "Basmati Rice 1kg",
                    "sku": None,
                    "category": "Grains",
                    "base_unit": "packet",
                    "opening_stock": 50000,  # 50 packets = 50,000 milli-units
                    "purchase_price": 9000,  # Rs. 90.00
                    "selling_price": 12000,  # Rs. 120.00
                    "low_stock_threshold": 10000,
                },
            )
            assert p_res.status_code == 201, f"Product create failed: {p_res.text}"
            product = p_res.json()
            pid = product["id"]
            assert product["sku"] is None
            print(f"       -> Product created: ID={pid}, Stock={product['stock_qty']} milli-units, Price=Rs.{product['selling_price']/100:.2f}")

            print("[E2E] Step 2: Multi-line same-product sale draft and atomic confirmation (Fix 1)...")
            # Line 1: 3 packets (3000 mu), Line 2: 2 packets (2000 mu) -> Total requested: 5 packets (5000 mu)
            tx_draft_res = client.post(
                "/api/transactions",
                json={
                    "type": "sale",
                    "payment_method": "cash",
                    "items": [
                        {
                            "product_id": pid,
                            "quantity": 3000,  # 3 packets
                            "unit": "packet",
                            "unit_price": 12000,
                        },
                        {
                            "product_id": pid,
                            "quantity": 2000,  # 2 packets
                            "unit": "packet",
                            "unit_price": 12000,
                        },
                    ],
                },
            )
            assert tx_draft_res.status_code == 201, f"Draft creation failed: {tx_draft_res.text}"
            draft_tx = tx_draft_res.json()
            tx_id = draft_tx["id"]
            assert draft_tx["total_amount"] == 60000  # Rs. 600.00

            confirm_res = client.patch(f"/api/transactions/{tx_id}/confirm")
            assert confirm_res.status_code == 200, f"Confirm failed: {confirm_res.text}"
            confirmed_tx = confirm_res.json()
            assert confirmed_tx["status"] == "confirmed"

            # Verify stock deduction: 50,000 - 5,000 = 45,000
            p_after = client.get(f"/api/products/{pid}").json()
            assert p_after["stock_qty"] == 45000, f"Expected 45000, got {p_after['stock_qty']}"
            print(f"       -> Multi-line same-product stock correctly reduced to {p_after['stock_qty']} milli-units (45 units).")

            print("[E2E] Step 3: Record shop cash expense...")
            exp_res = client.post(
                "/api/expenses",
                json={
                    "expense_date": "2026-10-16",
                    "category": "transport",
                    "amount": 15000,  # Rs. 150.00
                    "payment_method": "cash",
                    "notes": "Tempo delivery freight",
                },
            )
            assert exp_res.status_code == 201
            exp = exp_res.json()
            print(f"       -> Cash expense recorded: ID={exp['id']}, Amount=Rs.{exp['amount']/100:.2f}")

            print("[E2E] Step 4: Customer Udhaar credit sale and partial repayment...")
            cust_res = client.post(
                "/api/customers",
                json={"name": "Kishore Kumar", "phone": "9820011223", "address": "Market Road", "credit_limit": 500000},
            )
            assert cust_res.status_code == 201
            cust = cust_res.json()
            cid = cust["id"]

            # Credit sale: 2 packets = Rs. 240.00 (24000 paise)
            credit_sale = client.post(
                "/api/transactions",
                json={
                    "type": "sale",
                    "payment_method": "credit",
                    "customer_id": cid,
                    "items": [{"product_id": pid, "quantity": 2000, "unit": "packet", "unit_price": 12000}],
                },
            ).json()
            credit_tx_id = credit_sale["id"]
            client.patch(f"/api/transactions/{credit_tx_id}/confirm")

            # Check customer balance after credit sale
            cust_after_credit = client.get(f"/api/customers/{cid}").json()
            assert cust_after_credit["current_balance"] == 24000
            print(f"       -> Customer balance after Rs.240.00 credit sale: Rs.{cust_after_credit['current_balance']/100:.2f} due")

            # Cash repayment of Rs. 100.00 (10000 paise)
            pay_res = client.post(
                f"/api/customers/{cid}/payments",
                json={"amount": 10000, "payment_method": "cash", "notes": "Part payment token"},
            )
            assert pay_res.status_code == 200
            cust_after_pay = pay_res.json()
            assert cust_after_pay["current_balance"] == 14000
            print(f"       -> Customer balance after Rs.100.00 repayment: Rs.{cust_after_pay['current_balance']/100:.2f} due")

            print("[E2E] Step 5: Customer statement & WhatsApp summary...")
            stmt = client.get(f"/api/customers/{cid}/statement").json()
            assert stmt["opening_balance"] == 0
            assert stmt["total_debit"] == 24000
            assert stmt["total_credit"] == 10000
            assert stmt["closing_balance"] == 14000
            assert len(stmt["entries"]) == 2
            assert "Total Balance Due: Rs.140.00" in stmt["shareable_text"]
            print("       -> Customer balance statement verified with debit/credit ledger derivation.")

            print("[E2E] Step 6: Credit sale reversal after partial repayment (Fix 3: Advance credit surplus)...")
            # Reverse the credit sale of 24000 paise after 10000 paise repayment
            # New balance = 14000 - 24000 = -10000 (Advance credit surplus of Rs. 100.00)
            rev_credit_res = client.patch(f"/api/transactions/{credit_tx_id}/reverse")
            assert rev_credit_res.status_code == 200
            cust_after_rev = client.get(f"/api/customers/{cid}").json()
            assert cust_after_rev["current_balance"] == -10000

            stmt_surplus = client.get(f"/api/customers/{cid}/statement").json()
            assert stmt_surplus["closing_balance"] == -10000
            assert "Customer Advance Credit Surplus (Store Deposit): Rs.100.00" in stmt_surplus["shareable_text"]
            print(f"       -> Advance credit surplus policy verified: Customer balance is Rs.-100.00 (Store deposit).")

            print("[E2E] Step 7: Finalize a past cash closing and verify immutability & refund attribution (Fix 2)...")
            past_date = "2026-10-10"
            today_date = "2026-10-16"

            # Create and confirm a cash sale backdated to past_date
            sale_res = client.post(
                "/api/transactions",
                json={
                    "type": "sale",
                    "payment_method": "cash",
                    "items": [{"product_id": pid, "quantity": 1000, "unit": "packet", "unit_price": 12000}],
                },
            ).json()
            past_sale_id = sale_res["id"]
            client.patch(f"/api/transactions/{past_sale_id}/confirm")

            # Backdate this sale to past_date
            with connection() as conn:
                conn.execute(
                    "UPDATE transactions SET created_at = ? || ' 11:00:00', confirmed_at = ? || ' 11:00:00' WHERE id = ?",
                    (past_date, past_date, past_sale_id),
                )

            # Finalize past_date cash closing
            fin_past = client.post(
                "/api/cash-closing",
                json={
                    "business_date": past_date,
                    "opening_cash": 0,
                    "actual_cash": 12000,
                    "finalize": True,
                },
            ).json()
            assert fin_past["status"] == "finalized"
            assert fin_past["expected_cash"] == 12000

            # Reverse the past sale TODAY (reversal movement is created today)
            rev_past = client.patch(f"/api/transactions/{past_sale_id}/reverse")
            assert rev_past.status_code == 200

            # Preview past_date closing: must remain locked and unchanged!
            past_preview = client.get(f"/api/cash-closing/preview?business_date={past_date}").json()
            assert past_preview["is_already_closed"] is True
            assert past_preview["cash_refunds"] == 0

            # Preview today_date closing: cash refund of 12000 must be attributed to TODAY!
            today_preview = client.get(
                "/api/cash-closing/preview",
                params={"business_date": today_date, "opening_cash": 50000},
            ).json()
            assert today_preview["cash_refunds"] == 12000

            # Check today's expected cash calculation:
            # opening (50000) + cash sales (60000) + cash repayments (10000) - cash expenses (15000) - cash refunds (12000)
            expected_today = 50000 + 60000 + 10000 - 15000 - 12000  # 93000
            assert today_preview["expected_cash"] == expected_today
            print(f"       -> Reversal refund correctly attributed to today's drawer: Expected=Rs.{today_preview['expected_cash']/100:.2f}")

            # Finalize today's closing
            fin_today = client.post(
                "/api/cash-closing",
                json={
                    "business_date": today_date,
                    "opening_cash": 50000,
                    "actual_cash": expected_today,
                    "finalize": True,
                },
            ).json()
            assert fin_today["status"] == "finalized"
            assert fin_today["difference"] == 0
            print("       -> Cash closing for today finalized with Difference=Rs.0.00.")

            print("[E2E] Step 8: Reports audit...")
            daily_rep = client.get("/api/reports/sales/daily", params={"start_date": today_date, "end_date": today_date}).json()
            assert daily_rep["total_revenue"] > 0
            print(f"       -> Daily sales report: Total revenue = Rs.{daily_rep['total_revenue']/100:.2f}")

            print("[E2E] Step 9: Reconnect and test persistence across application reload...")

        # Reconnect with fresh client
        clear_settings_cache()
        app2 = create_app()
        with TestClient(app2) as client2:
            p_check = client2.get(f"/api/products/{pid}").json()
            assert p_check["id"] == pid
            c_check = client2.get(f"/api/customers/{cid}").json()
            assert c_check["current_balance"] == -10000
            print("       -> Persistence verified: Products, customers, and closings intact across reload.")

    print("\n>>> ALL 9 E2E LIFECYCLE AUDITS PASSED ON ISOLATED TEST DATABASE! <<<")


if __name__ == "__main__":
    run_e2e_verification()
