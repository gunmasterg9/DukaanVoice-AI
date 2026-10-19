/**
 * Unit tests for Frontend MCP Client & Multilingual Query Interpreter.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mcpClient } from './services/mcpClient.js'

describe('Frontend MCP Client & Multilingual Query Interpreter', () => {
  it('correctly identifies sales query in English and extracts quantity and unit', async () => {
    // Mock callTool so this test runs offline without a live backend
    const originalCallTool = mcpClient.callTool
    mcpClient.callTool = async (name, args) => {
      return {
        status: 'proposal',
        draft_id: 101,
        product_name: 'Biscuits',
        quantity: args.quantity,
        unit: args.unit,
        total_amount_rupees: '₹50.00',
        current_stock: 50.0,
        proposed_stock: 45.0,
        base_unit: 'packet',
        message: 'Proposed sale of 5 packet of Biscuits.',
      }
    }

    try {
      const res = await mcpClient.processShopkeeperQuery('We sold 5 packets of biscuits', 'en')
      assert.equal(res.type, 'sale_proposal')
      assert.equal(res.tool, 'record_sale')
      assert.equal(res.data.status, 'proposal')
      assert.equal(res.data.quantity, 5)
      assert.equal(res.data.unit, 'packet')
      assert.equal(res.data.current_stock, 50.0)
      assert.equal(res.data.proposed_stock, 45.0)
    } finally {
      mcpClient.callTool = originalCallTool
    }
  })

  it('correctly identifies Gujarati sales utterance "પાંચ પેકેટ ચા વેચ્યા"', async () => {
    const originalCallTool = mcpClient.callTool
    mcpClient.callTool = async (name, args) => {
      return {
        status: 'proposal',
        draft_id: 102,
        product_name: 'ગુજરાતી પ્રીમિયમ ચા',
        quantity: args.quantity,
        unit: args.unit,
        total_amount_rupees: '₹160.00',
        current_stock: 40.0,
        proposed_stock: 35.0,
        base_unit: 'packet',
        message: 'Proposed sale of 5 packet of ચા.',
      }
    }

    try {
      const res = await mcpClient.processShopkeeperQuery('પાંચ પેકેટ ચા વેચ્યા', 'gu')
      assert.equal(res.type, 'sale_proposal')
      assert.equal(res.tool, 'record_sale')
      assert.equal(res.data.quantity, 5)
      assert.equal(res.data.unit, 'packet')
    } finally {
      mcpClient.callTool = originalCallTool
    }
  })

  it('correctly identifies Hindi purchase receipt "१० पैकेट आटा खरीदा"', async () => {
    const originalCallTool = mcpClient.callTool
    mcpClient.callTool = async (name, args) => {
      return {
        status: 'proposal',
        draft_id: 103,
        product_name: 'Atta',
        quantity: args.quantity,
        unit: args.unit,
        total_cost_rupees: '₹2800.00',
        current_stock: 10.0,
        proposed_stock: 20.0,
        base_unit: 'bag',
        message: 'Proposed purchase of 10 packet of Atta.',
      }
    }

    try {
      const res = await mcpClient.processShopkeeperQuery('१० पैकेट आटा खरीदा', 'hi')
      assert.equal(res.type, 'purchase_proposal')
      assert.equal(res.tool, 'record_purchase')
      assert.equal(res.data.quantity, 10)
    } finally {
      mcpClient.callTool = originalCallTool
    }
  })

  it('correctly identifies daily report queries in English, Gujarati, and Hindi', async () => {
    const originalCallTool = mcpClient.callTool
    mcpClient.callTool = async (name, args) => {
      return {
        business_date: args.business_date,
        total_revenue_rupees: '₹1,500.00',
        confirmed_sales_count: 8,
      }
    }

    try {
      const resEn = await mcpClient.processShopkeeperQuery('Show today sales report', 'en')
      assert.equal(resEn.type, 'report')
      assert.equal(resEn.tool, 'get_daily_report')

      const resGu = await mcpClient.processShopkeeperQuery('આજનું વેચાણ બતાવો', 'gu')
      assert.equal(resGu.type, 'report')

      const resHi = await mcpClient.processShopkeeperQuery('आज की बिक्री का हिसाब', 'hi')
      assert.equal(resHi.type, 'report')
    } finally {
      mcpClient.callTool = originalCallTool
    }
  })

  it('handles empty query gracefully with user-friendly message', async () => {
    const res = await mcpClient.processShopkeeperQuery('   ')
    assert.equal(res.type, 'error')
    assert.ok(res.message.includes('Please provide a shop request'))
  })
})
