/**
 * Official Streamable HTTP MCP (Model Context Protocol 2025-11-25) Client
 * for DukaanVoice AI - Alexa+ Hackathon Integration.
 * 
 * Handles:
 * 1. Streamable HTTP JSON-RPC 2.0 handshake (initialize).
 * 2. Mcp-Session-Id header management and tracking.
 * 3. Tool discovery (tools/list).
 * 4. Tool execution (tools/call) with safe error extraction.
 * 5. Multilingual Natural Language query parsing for Gujarati, Hindi, and English Kirana workflows.
 */

const BASE_URL = typeof window !== 'undefined' ? '' : 'http://127.0.0.1:8000'
const MCP_ENDPOINT = `${BASE_URL}/api/mcp/`
const MCP_FALLBACK_ENDPOINT = `${BASE_URL}/mcp/`

const WORD_TO_NUM = {
  // English words
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  // Gujarati words
  'એક': 1, 'બે': 2, 'ત્રણ': 3, 'ચાર': 4, 'પાંચ': 5,
  'છ': 6, 'સાત': 7, 'આઠ': 8, 'નવ': 9, 'દસ': 10,
  // Hindi words
  'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पांच': 5,
  'पाँच': 5, 'छह': 6, 'सात': 7, 'आठ': 8, 'नौ': 9, 'दस': 10,
}

function parseQuantity(text) {
  // Normalize Indic digits (Devanagari ०-९ and Gujarati ૦-૯) to Latin 0-9
  const normalized = text
    .replace(/[૦०]/g, '0')
    .replace(/[૧१]/g, '1')
    .replace(/[૨२]/g, '2')
    .replace(/[૩३]/g, '3')
    .replace(/[૪४]/g, '4')
    .replace(/[૫५]/g, '5')
    .replace(/[૬६]/g, '6')
    .replace(/[૭७]/g, '7')
    .replace(/[૮८]/g, '8')
    .replace(/[૯९]/g, '9')

  const numMatch = normalized.match(/(\d+(?:\.\d+)?)/)
  if (numMatch) {
    return parseFloat(numMatch[1])
  }

  for (const [w, val] of Object.entries(WORD_TO_NUM)) {
    if (new RegExp(`\\b${w}\\b`, 'i').test(normalized) || normalized.includes(w)) {
      return val
    }
  }

  return null
}

class McpClient {
  constructor() {
    this.sessionId = null
    this.initialized = false
    this.protocolVersion = '2025-11-25'
    this.serverInfo = null
    this.tools = []
    this.activeEndpoint = MCP_ENDPOINT
    this.requestId = 1
  }

  /**
   * Send JSON-RPC 2.0 request over Streamable HTTP transport
   */
  async _sendRpc(method, params = {}, isNotification = false) {
    const id = isNotification ? undefined : this.requestId++
    const payload = {
      jsonrpc: '2.0',
      ...(id !== undefined ? { id } : {}),
      method,
      params,
    }

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    }
    if (this.sessionId) {
      headers['mcp-session-id'] = this.sessionId
    }

    let res
    try {
      res = await fetch(this.activeEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      })
    } catch {
      // Try fallback endpoint (/mcp directly if /api/mcp failed)
      this.activeEndpoint = this.activeEndpoint === MCP_ENDPOINT ? MCP_FALLBACK_ENDPOINT : MCP_ENDPOINT
      res = await fetch(this.activeEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      })
    }

    // Capture Mcp-Session-Id header
    const sid = res.headers.get('mcp-session-id')
    if (sid) {
      this.sessionId = sid
    }

    if (isNotification) {
      return { ok: true }
    }

    if (!res.ok && res.status !== 200) {
      const errText = await res.text()
      throw new Error(`MCP HTTP ${res.status}: ${errText || res.statusText}`)
    }

    const data = await res.json()
    if (data.error) {
      throw new Error(data.error.message || `MCP RPC Error ${data.error.code}`)
    }
    return data.result
  }

  /**
   * Perform protocol initialization and capability negotiation
   */
  async initialize() {
    try {
      const result = await this._sendRpc('initialize', {
        protocolVersion: this.protocolVersion,
        capabilities: {},
        clientInfo: {
          name: 'dukaanvoice-alexa-simulator',
          version: '1.0.0',
        },
      })

      this.initialized = true
      this.protocolVersion = result.protocolVersion || this.protocolVersion
      this.serverInfo = result.serverInfo

      // Send notifications/initialized per specification
      await this._sendRpc('notifications/initialized', {}, true).catch(() => {})

      // Fetch tools list
      await this.listTools()
      return {
        success: true,
        sessionId: this.sessionId,
        serverInfo: this.serverInfo,
        protocolVersion: this.protocolVersion,
      }
    } catch (err) {
      this.initialized = false
      return {
        success: false,
        error: err.message,
      }
    }
  }

  /**
   * Discover registered tools
   */
  async listTools() {
    if (!this.initialized) {
      await this.initialize()
    }
    const result = await this._sendRpc('tools/list', {})
    this.tools = result?.tools || []
    return this.tools
  }

  /**
   * Execute an MCP Tool by name with validated arguments
   */
  async callTool(name, argumentsObj = {}) {
    if (!this.initialized) {
      await this.initialize()
    }

    const result = await this._sendRpc('tools/call', {
      name,
      arguments: argumentsObj,
    })

    if (!result) {
      throw new Error(`Tool '${name}' returned empty response.`)
    }

    // Official MCP SDK wraps text results in content[0].text
    const textContent = result.content?.[0]?.text
    if (textContent) {
      try {
        const parsed = JSON.parse(textContent)
        return parsed
      } catch {
        return { message: textContent }
      }
    }
    return result
  }

  /**
   * Natural Language Request Interpreter for Kirana shopkeepers.
   * Maps multilingual input (English, Gujarati, Hindi) to authoritative MCP tool calls.
   */
  async processShopkeeperQuery(rawText, _activeLocale = 'en') {
    const text = (rawText || '').trim()
    if (!text) {
      return {
        type: 'error',
        message: 'Please provide a shop request or select a sample scenario below.',
      }
    }

    // Strip leading assistant / wake-word prefix if present (e.g. "Alexa, ", "Hey Alexa, ", "DukaanVoice, ", "દુકાનવોઇસ, ", "दुकानवॉइस, ")
    const stripped = text
      .replace(/^(?:hey\s+|ok\s+|hi\s+|namaste\s+)?(?:alexa|dukaanvoice|dukaan\s+voice|દુકાનવોઇસ|દુકાન\s+વોઇસ|दुकानवॉइस|दुकान\s+वॉइस)[,\s:]+/i, '')
      .trim()
    const queryText = stripped.length > 0 ? stripped : text

    const lower = queryText.toLowerCase()
    const cleanLower = lower.replace(/[.,/#!$%^&*;:{}=\-_`~()?]/g, ' ').replace(/\s+/g, ' ').trim()

    // 1. Explicit Confirmation & Cancellation intents
    const confirmWords = ['yes', 'confirm', 'confirm it', 'yes please', 'हाँ', 'हा', 'पुष्टि करें', 'कर दो', 'હા', 'ચોક્કસ', 'કન્ફર્મ']
    const cancelWords = ['no', 'cancel', 'cancel it', 'stop', 'ना', 'नहीं', 'रद्द करें', 'रद्द', 'ના', 'રદ કરો', 'રદ']

    if (confirmWords.includes(cleanLower)) {
      return {
        type: 'confirmation',
        userQuery: text,
      }
    }
    if (cancelWords.includes(cleanLower)) {
      return {
        type: 'cancellation',
        userQuery: text,
      }
    }

    // 2. Report queries
    const reportKws = [
      'report', 'sales today', "today's sales", 'today sales', 'summary', 'revenue',
      'આજનું વેચાણ', 'આજના વેચાણ', 'વેચાણ અહેવાલ', 'દૈનિક વેચાણ', 'આવક', 'હિસાબ બતાવો',
      'आज की बिक्री', 'दैनिक बिक्री', 'आज का हिसाब', 'कमाई', 'बिक्री बताओ', 'हिसाब बताओ'
    ]
    if (reportKws.some((kw) => lower.includes(kw.toLowerCase()))) {
      const todayStr = new Date().toISOString().split('T')[0]
      const reportRes = await this.callTool('get_daily_report', { business_date: todayStr })
      return {
        type: 'report',
        tool: 'get_daily_report',
        data: reportRes,
        userQuery: text,
      }
    }

    // 3. Sale queries
    const saleKws = [
      'sold', 'sell', 'sale', 'selling',
      'વેચ્યા', 'વેચ્યું', 'વેચો', 'વેચાણ', 'વેચવાના', 'વેચવાની', 'વેચવા',
      'बेचे', 'बेचा', 'बेचो', 'बिक्री', 'बेचने', 'बेचनी'
    ]
    const isSale = saleKws.some((kw) => lower.includes(kw.toLowerCase()))

    // 4. Purchase queries
    const purchaseKws = [
      'bought', 'buy', 'purchase', 'received', 'receive', 'incoming',
      'ખરીદ્યા', 'ખરીદ્યું', 'ખરીદો', 'આવ્યા', 'આવ્યું', 'મળ્યા', 'મળ્યું',
      'खरीदे', 'खरीदा', 'खरीद', 'आया', 'आए', 'प्राप्त'
    ]
    const isPurchase = purchaseKws.some((kw) => lower.includes(kw.toLowerCase()))

    // Extract quantity (supports Latin numbers, Indic numerals, and number words)
    const quantity = parseQuantity(queryText)

    // Extract unit
    const unitMatch = lower.match(/(packet|packets|piece|pieces|kg|kilo|gram|litre|litres|bag|bags|box|boxes|jar|jars|પેકેટ|નંગ|કિલો|લિટર|દાગીના|બોક્સ|ડબ્બા|ડબ્બો|पैकेट|नग|किलो|लीटर|डिब्बे|डिब्बा|बॉक्स)/)
    let unit = undefined
    if (unitMatch) {
      const u = unitMatch[1]
      if (['packet', 'packets', 'પેકેટ', 'पैकेट'].includes(u)) unit = 'packet'
      else if (['piece', 'pieces', 'નંગ', 'नग'].includes(u)) unit = 'piece'
      else if (['kg', 'kilo', 'કિલો', 'किलो'].includes(u)) unit = 'kg'
      else if (['litre', 'litres', 'લિટર', 'लीटर'].includes(u)) unit = 'litre'
      else if (['bag', 'bags'].includes(u)) unit = 'bag'
      else if (['jar', 'jars'].includes(u)) unit = 'jar'
      else if (['box', 'boxes', 'બોક્સ', 'ડબ્બા', 'ડબ્બો', 'डिब्बे', 'डिब्बा', 'बॉक्स'].includes(u)) unit = 'box'
    }

    if (isSale || isPurchase) {
      // Safety guardrail: do NOT infer missing quantities
      if (quantity === null || quantity <= 0) {
        const isHi = /[\u0900-\u097F]/.test(text)
        const isGu = /[\u0A80-\u0AFF]/.test(text)
        const clarifyMsg = isGu
          ? 'કૃપા કરીને જથ્થો જણાવો (દા.ત. "૫ પેકેટ બિસ્કિટ વેચવાના છે").'
          : isHi
            ? 'कृपया मात्रा बताएं (जैसे "पांच पैकेट बिस्कुट बेचने हैं")।'
            : `Please specify the quantity you want to ${isSale ? 'sell' : 'record as purchase'} (for example: "${isSale ? 'Sell 5 packets of biscuits' : 'We received 2 boxes of soap'}").`
        return {
          type: 'clarification',
          message: clarifyMsg,
          userQuery: text,
        }
      }

      // Isolate candidate product name by stripping action keywords, numbers, and units
      let candidate = queryText
      // Remove numbers (both Latin and Indic digits)
      candidate = candidate.replace(/[\u0AE6-\u0AEF\u0966-\u096F\d]+(?:\.\d+)?/g, ' ')

      // Strip action words, number words, and units (longer phrases first)
      const stripList = [
        ...saleKws, ...purchaseKws,
        ...Object.keys(WORD_TO_NUM),
        'packets', 'packet', 'pieces', 'piece', 'boxes', 'box', 'bags', 'bag', 'jars', 'jar',
        'પેકેટ', 'નંગ', 'બોક્સ', 'દાગીના', 'છે', 'હતા',
        'पैकेट', 'नग', 'डिब्बे', 'डिब्बा', 'बॉक्स', 'बोरी', 'हैं', 'है', 'था', 'थी',
        'of', 'we', 'i', 'the', 'nos', 'kg', 'kilo', 'litre', 'nos.', 'a', 'an'
      ]
      const sortedStripList = [...stripList].sort((a, b) => b.length - a.length)
      sortedStripList.forEach((w) => {
        if (/^[a-z0-9.]+$/i.test(w)) {
          candidate = candidate.replace(new RegExp(`\\b${w}\\b`, 'gi'), ' ')
        } else {
          candidate = candidate.split(w).join(' ')
        }
      })
      candidate = candidate.replace(/[.,/#!$%^&*;:{}=\-_`~()?]/g, ' ')
        .replace(/[\u0901-\u0903\u0A81-\u0A83]/g, ' ')
        .replace(/\s+/g, ' ').trim()

      // Singularize English plurals (e.g. "biscuits" -> "biscuit", "soaps" -> "soap") for catalog lookup
      if (candidate.toLowerCase().endsWith('s') && !candidate.toLowerCase().endsWith('ss') && candidate.length > 3) {
        candidate = candidate.slice(0, -1)
      }

      if (!candidate) {
        const isHi = /[\u0900-\u097F]/.test(text)
        const isGu = /[\u0A80-\u0AFF]/.test(text)
        const clarifyMsg = isGu
          ? 'કૃપા કરીને પ્રોડક્ટનું નામ જણાવો (દા.ત. "૫ પેકેટ બિસ્કિટ વેચવાના છે").'
          : isHi
            ? 'कृपया उत्पाद का नाम बताएं (जैसे "पांच पैकेट बिस्कुट बेचने हैं")।'
            : 'Please specify the product name (for example: "Sell 5 packets of biscuits").'
        return {
          type: 'clarification',
          message: clarifyMsg,
          userQuery: text,
        }
      }

      const toolName = isSale ? 'record_sale' : 'record_purchase'

      // Always execute with confirm=false to generate PROPOSAL first!
      const proposalRes = await this.callTool(toolName, {
        product_name_or_sku: candidate,
        quantity,
        unit,
        confirm: false,
      })

      return {
        type: isSale ? 'sale_proposal' : 'purchase_proposal',
        tool: toolName,
        data: proposalRes,
        userQuery: text,
      }
    }

    // 5. Stock / Inventory inquiry
    const stockKws = [
      'stock', 'inventory', 'check', 'how much', 'how many', 'left', 'remaining', 'available', 'balance', 'find', 'have',
      'સ્ટોક', 'માલ', 'શોધો', 'કેટલો', 'કેટલું', 'કેટલા', 'બાકી', 'બાકી છે',
      'स्टॉक', 'माल', 'खोजो', 'कितना', 'कितने', 'बचे', 'बचे हैं', 'है क्या'
    ]

    let searchQuery = queryText
    const searchStrip = [
      ...stockKws,
      'how many', 'how much', 'packets of', 'packet of', 'packets', 'packet', 'pieces', 'piece', 'boxes', 'box',
      'of', 'the', 'is', 'there', 'any', 'available', 'balance', 'units', 'left', 'are',
      'પેકેટના', 'પેકેટ', 'ના', 'છે?', 'છે', 'બતાવો', 'આપો', 'ચકાસો',
      'पैकेट के', 'पैकेट', 'के', 'हैं?', 'हैं', 'है?', 'है', 'दिखाओ', 'बताओ', 'जांचो'
    ]
    const sortedSearchStrip = [...searchStrip].sort((a, b) => b.length - a.length)
    sortedSearchStrip.forEach((w) => {
      if (/^[a-z0-9. ]+$/i.test(w)) {
        searchQuery = searchQuery.replace(new RegExp(`\\b${w}\\b`, 'gi'), ' ')
      } else {
        searchQuery = searchQuery.split(w).join(' ')
      }
    })
    searchQuery = searchQuery.replace(/[.,/#!$%^&*;:{}=\-_`~()?]/g, ' ')
      .replace(/[\u0901-\u0903\u0A81-\u0A83]/g, ' ')
      .replace(/\s+/g, ' ').trim()

    // Singularize if ending with 's' (e.g. "biscuits" -> "biscuit")
    if (searchQuery.toLowerCase().endsWith('s') && !searchQuery.toLowerCase().endsWith('ss') && searchQuery.length > 3) {
      searchQuery = searchQuery.slice(0, -1)
    }

    const invRes = await this.callTool('get_inventory', {
      query: searchQuery || undefined,
      limit: 10,
    })

    return {
      type: 'inventory_inquiry',
      tool: 'get_inventory',
      data: invRes,
      userQuery: text,
      searchQuery,
    }
  }

  /**
   * Confirm a previously proposed draft transaction
   */
  async confirmProposal(toolName, draftId, productName, quantity, unit) {
    return await this.callTool(toolName, {
      product_name_or_sku: productName,
      quantity,
      unit,
      confirm: true,
      draft_id: draftId,
    })
  }
}

export const mcpClient = new McpClient()
