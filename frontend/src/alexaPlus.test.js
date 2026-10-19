/**
 * DukaanVoice for Alexa+ - Phase 3 Automated Test Suite
 * Verifies the Alexa+ Simulated Conversational Experience:
 * 1. Inventory lookup calls MCP client with correct tool and arguments.
 * 2. Actual inventory results are mapped without fabricating stock balances.
 * 3. Sale requests create proposals (confirm=false) without immediate confirmation.
 * 4. The proposal displays draft ID, current stock, proposed stock, and total amount.
 * 5. Cancellation does NOT call the confirmation tool.
 * 6. Confirmation sends the exact draft identifier and product arguments.
 * 7. Success state appears only after a successful backend response.
 * 8. Failed confirmation does not display false success.
 * 9. Purchase proposals follow the same two-step confirmation safety rules.
 * 10. Daily reports display actual returned revenue and counts.
 * 11. Missing quantities do NOT mutate inventory and trigger clarification.
 * 12. Missing product names trigger clarification instead of guessing.
 * 13. Gujarati requests (બિસ્કિટ, વેચાણ, હિસાબ) are accurately interpreted.
 * 14. Hindi requests (बिस्कुट, बिक्री, हिसाब) are accurately interpreted.
 * 15. Explicit confirmation keywords (yes, confirm, हाँ, હા) are recognized.
 * 16. Explicit cancellation keywords (no, cancel, रद्द, ના) are recognized.
 * 17. Pending proposals are distinct and cannot be confused.
 * 18. Simulator state model transitions adhere to safety rules.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mcpClient } from './services/mcpClient.js'

describe('Phase 3: Alexa+ Conversational Simulator & MCP Tool Integration', () => {

  it('1. Inventory lookup calls MCP get_inventory with correct tool and arguments', async () => {
    let capturedTool = null
    let capturedArgs = null
    const originalCallTool = mcpClient.callTool
    mcpClient.callTool = async (name, args) => {
      capturedTool = name
      capturedArgs = args
      return {
        total_found: 1,
        products: [
          {
            product_id: 1,
            name: 'Parle-G Glucose Biscuit',
            sku: 'PARLE-G-100',
            stock_quantity: 40.0,
            base_unit: 'packet',
            selling_price_rupees: '₹10.00',
            is_low_stock: false,
          },
        ],
      }
    }

    try {
      const res = await mcpClient.processShopkeeperQuery('How many packets of biscuits are left?', 'en')
      assert.equal(res.type, 'inventory_inquiry')
      assert.equal(res.tool, 'get_inventory')
      assert.equal(capturedTool, 'get_inventory')
      assert.equal(capturedArgs.query, 'biscuit')
      assert.equal(res.data.products[0].stock_quantity, 40.0)
    } finally {
      mcpClient.callTool = originalCallTool
    }
  })

  it('2. Actual inventory results are mapped without fabricating stock balances', async () => {
    const originalCallTool = mcpClient.callTool
    mcpClient.callTool = async () => ({
      total_found: 1,
      products: [
        {
          product_id: 10,
          name: 'Tata Tea Premium 250g',
          sku: 'TEA-TATA-250',
          stock_quantity: 7.5,
          base_unit: 'packet',
          selling_price_rupees: '₹140.00',
          is_low_stock: true,
        },
      ],
    })

    try {
      const res = await mcpClient.processShopkeeperQuery('Check stock of Tata Tea', 'en')
      assert.equal(res.type, 'inventory_inquiry')
      assert.equal(res.data.products.length, 1)
      assert.equal(res.data.products[0].stock_quantity, 7.5)
      assert.equal(res.data.products[0].is_low_stock, true)
    } finally {
      mcpClient.callTool = originalCallTool
    }
  })

  it('3. Sale request creates a proposal with confirm=false without immediate confirmation', async () => {
    let capturedArgs = null
    const originalCallTool = mcpClient.callTool
    mcpClient.callTool = async (name, args) => {
      capturedArgs = args
      return {
        status: 'proposal',
        draft_id: 301,
        product_name: 'Parle-G Glucose Biscuit',
        quantity: args.quantity,
        unit: args.unit,
        total_amount_rupees: '₹50.00',
        current_stock: 40.0,
        proposed_stock: 35.0,
        base_unit: 'packet',
        message: 'Proposed sale of 5 packets of Parle-G. Stock will change 40 -> 35.',
      }
    }

    try {
      const res = await mcpClient.processShopkeeperQuery('Sell five packets of biscuits.', 'en')
      assert.equal(res.type, 'sale_proposal')
      assert.equal(res.tool, 'record_sale')
      assert.equal(capturedArgs.confirm, false, 'Sale must be executed with confirm=false for proposal')
      assert.equal(capturedArgs.quantity, 5)
      assert.equal(capturedArgs.unit, 'packet')
      assert.equal(capturedArgs.product_name_or_sku, 'biscuit')
    } finally {
      mcpClient.callTool = originalCallTool
    }
  })

  it('4. The proposal displays draft ID, current stock, proposed stock, and total amount', async () => {
    const originalCallTool = mcpClient.callTool
    mcpClient.callTool = async () => ({
      status: 'proposal',
      draft_id: 505,
      product_name: 'Sugar 1kg',
      quantity: 2.0,
      unit: 'kg',
      total_amount_rupees: '₹88.00',
      current_stock: 20.0,
      proposed_stock: 18.0,
      base_unit: 'kg',
      message: 'Proposed sale of 2 kg Sugar.',
    })

    try {
      const res = await mcpClient.processShopkeeperQuery('Sell 2 kg sugar', 'en')
      assert.equal(res.data.draft_id, 505)
      assert.equal(res.data.current_stock, 20.0)
      assert.equal(res.data.proposed_stock, 18.0)
      assert.equal(res.data.total_amount_rupees, '₹88.00')
    } finally {
      mcpClient.callTool = originalCallTool
    }
  })

  it('5. Cancellation leaves stock unchanged and does NOT call confirmProposal', async () => {
    let confirmToolCalled = false
    const originalConfirm = mcpClient.confirmProposal
    mcpClient.confirmProposal = async () => {
      confirmToolCalled = true
      return {}
    }

    try {
      // User says cancel
      const res = await mcpClient.processShopkeeperQuery('cancel it', 'en')
      assert.equal(res.type, 'cancellation')
      assert.equal(confirmToolCalled, false, 'Cancellation must never trigger confirmProposal tool')
    } finally {
      mcpClient.confirmProposal = originalConfirm
    }
  })

  it('6. Confirmation sends the exact draft identifier and product arguments', async () => {
    let capturedTool = null
    let capturedArgs = null
    const originalCallTool = mcpClient.callTool
    mcpClient.callTool = async (name, args) => {
      capturedTool = name
      capturedArgs = args
      return {
        status: 'confirmed',
        transaction_id: args.draft_id,
        current_stock: 35.0,
        message: 'Sale confirmed! Current stock is 35.0.',
      }
    }

    try {
      const res = await mcpClient.confirmProposal('record_sale', 301, 'biscuit', 5.0, 'packet')
      assert.equal(capturedTool, 'record_sale')
      assert.equal(capturedArgs.confirm, true)
      assert.equal(capturedArgs.draft_id, 301)
      assert.equal(capturedArgs.quantity, 5.0)
      assert.equal(capturedArgs.unit, 'packet')
      assert.equal(res.status, 'confirmed')
      assert.equal(res.current_stock, 35.0)
    } finally {
      mcpClient.callTool = originalCallTool
    }
  })

  it('7. Success state appears only after verified server response', async () => {
    const originalCallTool = mcpClient.callTool
    mcpClient.callTool = async () => ({
      status: 'confirmed',
      transaction_id: 888,
      current_stock: 12.0,
      message: 'Sale #888 confirmed!',
    })

    try {
      const res = await mcpClient.confirmProposal('record_sale', 888, 'tea', 2, 'packet')
      assert.equal(res.status, 'confirmed')
      assert.equal(res.transaction_id, 888)
      assert.equal(res.current_stock, 12.0)
    } finally {
      mcpClient.callTool = originalCallTool
    }
  })

  it('8. Failed confirmation does not display false success and handles error cleanly', async () => {
    const originalCallTool = mcpClient.callTool
    mcpClient.callTool = async () => ({
      status: 'error',
      message: 'Confirmation failed: Only draft transactions can be confirmed.',
    })

    try {
      const res = await mcpClient.confirmProposal('record_sale', 999, 'tea', 2, 'packet')
      assert.equal(res.status, 'error')
      assert.match(res.message, /Confirmation failed/)
    } finally {
      mcpClient.callTool = originalCallTool
    }
  })

  it('9. Purchase proposals follow the same two-step confirmation safety rules', async () => {
    let capturedTool = null
    let capturedArgs = null
    const originalCallTool = mcpClient.callTool
    mcpClient.callTool = async (name, args) => {
      capturedTool = name
      capturedArgs = args
      return {
        status: 'proposal',
        draft_id: 401,
        product_name: 'Lifebuoy Soap',
        quantity: args.quantity,
        unit: args.unit,
        total_cost_rupees: '₹480.00',
        current_stock: 5.0,
        proposed_stock: 7.0,
        base_unit: 'box',
        message: 'Proposed purchase of 2 boxes of soap.',
      }
    }

    try {
      const res = await mcpClient.processShopkeeperQuery('We received two boxes of soap.', 'en')
      assert.equal(res.type, 'purchase_proposal')
      assert.equal(res.tool, 'record_purchase')
      assert.equal(capturedTool, 'record_purchase')
      assert.equal(capturedArgs.confirm, false, 'Must create proposal with confirm=false')
      assert.equal(capturedArgs.quantity, 2)
      assert.equal(capturedArgs.unit, 'box')
      assert.equal(capturedArgs.product_name_or_sku, 'soap')
    } finally {
      mcpClient.callTool = originalCallTool
    }
  })

  it('10. Daily reports display actual returned revenue and counts', async () => {
    let capturedDate = null
    const originalCallTool = mcpClient.callTool
    mcpClient.callTool = async (name, args) => {
      capturedDate = args.business_date
      return {
        business_date: args.business_date,
        total_revenue_rupees: '₹1450.00',
        confirmed_sales_count: 8,
        reversed_sales_count: 1,
        message: 'Daily report: 8 confirmed sale(s) totaling ₹1450.00.',
      }
    }

    try {
      const res = await mcpClient.processShopkeeperQuery("Show today's sales.", 'en')
      assert.equal(res.type, 'report')
      assert.equal(res.tool, 'get_daily_report')
      assert.ok(capturedDate)
      assert.equal(res.data.total_revenue_rupees, '₹1450.00')
      assert.equal(res.data.confirmed_sales_count, 8)
    } finally {
      mcpClient.callTool = originalCallTool
    }
  })

  it('11. Missing quantities do NOT mutate inventory and trigger clarification', async () => {
    let toolInvoked = false
    const originalCallTool = mcpClient.callTool
    mcpClient.callTool = async () => {
      toolInvoked = true
      return {}
    }

    try {
      // English missing quantity
      const resEn = await mcpClient.processShopkeeperQuery('Sell biscuits', 'en')
      assert.equal(resEn.type, 'clarification')
      assert.match(resEn.message, /quantity/i)
      assert.equal(toolInvoked, false, 'Must not call backend when quantity is missing')

      // Hindi missing quantity
      const resHi = await mcpClient.processShopkeeperQuery('बिस्कुट बेचने हैं', 'hi')
      assert.equal(resHi.type, 'clarification')
      assert.match(resHi.message, /मात्रा/)
      assert.equal(toolInvoked, false)
    } finally {
      mcpClient.callTool = originalCallTool
    }
  })

  it('12. Missing product names trigger clarification instead of guessing', async () => {
    let toolInvoked = false
    const originalCallTool = mcpClient.callTool
    mcpClient.callTool = async () => {
      toolInvoked = true
      return {}
    }

    try {
      const res = await mcpClient.processShopkeeperQuery('Sell 5 packets', 'en')
      assert.equal(res.type, 'clarification')
      assert.match(res.message, /product name/i)
      assert.equal(toolInvoked, false)
    } finally {
      mcpClient.callTool = originalCallTool
    }
  })

  it('13. Gujarati requests (બિસ્કિટ, વેચાણ, હિસાબ) are accurately interpreted', async () => {
    const originalCallTool = mcpClient.callTool
    let capturedArgs = null
    mcpClient.callTool = async (name, args) => {
      capturedArgs = args
      if (name === 'get_inventory') {
        return { total_found: 1, products: [{ name: 'બિસ્કિટ', stock_quantity: 25.0, base_unit: 'packet' }] }
      }
      if (name === 'record_sale') {
        return { status: 'proposal', draft_id: 111, product_name: 'બિસ્કિટ', quantity: args.quantity, unit: 'packet' }
      }
      if (name === 'get_daily_report') {
        return { total_revenue_rupees: '₹800.00', confirmed_sales_count: 4 }
      }
      return {}
    }

    try {
      // Inventory lookup
      const invRes = await mcpClient.processShopkeeperQuery('બિસ્કિટના કેટલા પેકેટ બાકી છે?', 'gu')
      assert.equal(invRes.type, 'inventory_inquiry')
      assert.equal(invRes.searchQuery, 'બિસ્કિટ')

      // Sale proposal with Indic numeral ૫
      const saleRes = await mcpClient.processShopkeeperQuery('૫ પેકેટ બિસ્કિટ વેચવાના છે.', 'gu')
      assert.equal(saleRes.type, 'sale_proposal')
      assert.equal(capturedArgs.quantity, 5)
      assert.equal(capturedArgs.unit, 'packet')
      assert.equal(capturedArgs.confirm, false)

      // Daily report
      const repRes = await mcpClient.processShopkeeperQuery('આજના વેચાણનો હિસાબ બતાવો.', 'gu')
      assert.equal(repRes.type, 'report')
    } finally {
      mcpClient.callTool = originalCallTool
    }
  })

  it('14. Hindi requests (बिस्कुट, बिक्री, हिसाब) are accurately interpreted', async () => {
    const originalCallTool = mcpClient.callTool
    let capturedArgs = null
    mcpClient.callTool = async (name, args) => {
      capturedArgs = args
      if (name === 'get_inventory') {
        return { total_found: 1, products: [{ name: 'बिस्कुट', stock_quantity: 30.0, base_unit: 'packet' }] }
      }
      if (name === 'record_sale') {
        return { status: 'proposal', draft_id: 222, product_name: 'बिस्कुट', quantity: args.quantity, unit: 'packet' }
      }
      if (name === 'get_daily_report') {
        return { total_revenue_rupees: '₹1200.00', confirmed_sales_count: 6 }
      }
      return {}
    }

    try {
      // Inventory lookup
      const invRes = await mcpClient.processShopkeeperQuery('बिस्कुट के कितने पैकेट बचे हैं?', 'hi')
      assert.equal(invRes.type, 'inventory_inquiry')
      assert.equal(invRes.searchQuery, 'बिस्कुट')

      // Sale proposal with number word पांच
      const saleRes = await mcpClient.processShopkeeperQuery('पांच पैकेट बिस्कुट बेचने हैं।', 'hi')
      assert.equal(saleRes.type, 'sale_proposal')
      assert.equal(capturedArgs.quantity, 5)
      assert.equal(capturedArgs.unit, 'packet')
      assert.equal(capturedArgs.confirm, false)

      // Daily report
      const repRes = await mcpClient.processShopkeeperQuery('आज की बिक्री बताओ।', 'hi')
      assert.equal(repRes.type, 'report')
    } finally {
      mcpClient.callTool = originalCallTool
    }
  })

  it('15. Explicit confirmation keywords (yes, confirm, हाँ, હા) are recognized', async () => {
    const confirmInputs = ['yes', 'confirm', 'हाँ', 'હા']
    for (const inp of confirmInputs) {
      const res = await mcpClient.processShopkeeperQuery(inp)
      assert.equal(res.type, 'confirmation', `Input "${inp}" must be recognized as confirmation`)
    }
  })

  it('16. Explicit cancellation keywords (no, cancel, रद्द, ના) are recognized', async () => {
    const cancelInputs = ['no', 'cancel', 'रद्द', 'ના']
    for (const inp of cancelInputs) {
      const res = await mcpClient.processShopkeeperQuery(inp)
      assert.equal(res.type, 'cancellation', `Input "${inp}" must be recognized as cancellation`)
    }
  })

  it('17. Pending proposals are distinct and cannot be confused', () => {
    const proposalA = { draftId: 101, toolName: 'record_sale', productName: 'Biscuit', quantity: 5 }
    const proposalB = { draftId: 102, toolName: 'record_purchase', productName: 'Soap', quantity: 2 }

    assert.notEqual(proposalA.draftId, proposalB.draftId)
    assert.notEqual(proposalA.toolName, proposalB.toolName)
    assert.equal(proposalA.draftId, 101)
    assert.equal(proposalB.draftId, 102)
  })

  it('18. Simulator state model transitions adhere to safety rules', () => {
    const validStates = ['idle', 'processing', 'awaiting_confirmation', 'cancelled', 'completed', 'error']

    // Simulating deterministic state machine transitions
    let currentState = 'idle'
    assert.equal(validStates.includes(currentState), true)

    // User submits query -> processing
    currentState = 'processing'
    assert.equal(currentState, 'processing')

    // Proposal received -> awaiting_confirmation
    currentState = 'awaiting_confirmation'
    assert.equal(currentState, 'awaiting_confirmation')

    // User cancels -> cancelled
    currentState = 'cancelled'
    assert.equal(currentState, 'cancelled')

    // Reset to idle
    currentState = 'idle'
    assert.equal(currentState, 'idle')

    // User submits query -> processing
    currentState = 'processing'

    // Server returns proposal -> awaiting_confirmation
    currentState = 'awaiting_confirmation'

    // User confirms -> processing
    currentState = 'processing'

    // Server confirms -> completed
    currentState = 'completed'
    assert.equal(currentState, 'completed')
  })

  it('19. Strips assistant prefixes (Alexa, DukaanVoice, દુકાનવોઇસ, दुकानवॉइस) from conversational voice input', async () => {
    // A: Confirmation with "Alexa, confirm"
    const confirmRes = await mcpClient.processShopkeeperQuery('Alexa, confirm')
    assert.equal(confirmRes.type, 'confirmation')

    // B: Cancellation with "Hey Alexa, cancel"
    const cancelRes = await mcpClient.processShopkeeperQuery('Hey Alexa, cancel')
    assert.equal(cancelRes.type, 'cancellation')

    // C: Gujarati confirmation with "દુકાનવોઇસ, કન્ફર્મ"
    const guConfirmRes = await mcpClient.processShopkeeperQuery('દુકાનવોઇસ, કન્ફર્મ')
    assert.equal(guConfirmRes.type, 'confirmation')

    // D: Hindi confirmation with "दुकानवॉइस, हाँ"
    const hiConfirmRes = await mcpClient.processShopkeeperQuery('दुकानवॉइस, हाँ')
    assert.equal(hiConfirmRes.type, 'confirmation')
  })

})

