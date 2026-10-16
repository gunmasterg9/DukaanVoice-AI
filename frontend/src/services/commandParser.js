/**
 * Language-aware Command Parser for DukaanVoice AI
 * 
 * Deterministic, offline-first command parsing for typed shopkeeper queries.
 * Supports read-only queries and draft creation with explicit confirmation guardrails.
 * Never directly modifies inventory or commits transactions.
 */

import { api } from './api.js'
import { paiseToRupees } from '../utils/formatters.js'

// Keyword dictionaries for Indian languages
const STOCK_KEYWORDS = [
  'stock', 'find', 'search', 'check', 'price',
  'સ્ટોક', 'શોધો', 'શોધ', 'કેટલો', 'કેટલું', 'ભાવ', 'માલ', // Gujarati
  'स्टॉक', 'खोजो', 'खोज', 'कितना', 'भाव', 'कीमत', 'माल',   // Hindi
  'साठा', 'शोधा', 'दर',                                    // Marathi
  'স্টক', 'খুঁজুন', 'দাম',                                   // Bengali
  'இருப்பு', 'தேடு', 'விலை',                               // Tamil
  'స్టాక్', 'వెతకండి', 'ధర',                                // Telugu
  'ದಾಸ್ತಾನು', 'ಹುಡುಕಿ', 'ಬೆಲೆ',                               // Kannada
  'സ്റ്റോക്ക്', 'തിരയുക', 'വില',                              // Malayalam
  'ਸਟਾਕ', 'ਖੋਜੋ', 'ਮੁੱਲ',                                    // Punjabi
  'ଷ୍ଟକ', 'ଖୋଜନ୍ତୁ', 'ମୂଲ୍ୟ',                                // Odia
  'মজুত', 'সন্ধান', 'মূল্য',                                  // Assamese
  'اسٹاک', 'تلاش', 'قیمت',                                  // Urdu
  'सञ्चयः', 'अन्विष्यतु', 'मूल्यम्',                           // Sanskrit
  'मौज्दात', 'खोज्नुहोस्',                                    // Nepali
  'ᱥᱴᱚᱠ', 'ᱥᱮᱸᱫᱽᱨᱟᱭ ᱢᱮ',                                      // Santali
]

const SALES_SUMMARY_KEYWORDS = [
  'today sales', 'todays sales', "today's sales", 'daily sales', 'today revenue', 'sales today', 'summary',
  'આજનું વેચાણ', 'વેચાણ અહેવાલ', 'દૈનિક વેચાણ', 'આવક',        // Gujarati
  'आज की बिक्री', 'दैनिक बिक्री', 'आज का हिसाब', 'कमाई',      // Hindi
  'आजची विक्री', 'दैनिक विक्री',                             // Marathi
  'আজকের বিক্রয়', 'দৈনিক বিক্রয়',                           // Bengali
  'இன்றைய விற்பனை', 'தினசரி விற்பனை',                      // Tamil
  'ఈరోజు అమ్మకాలు', 'రోజువారీ అమ్మకాలు',                     // Telugu
  'ಇಂದಿನ ಮಾರಾಟ', 'ದೈನಂದಿನ ಮಾರಾಟ',                           // Kannada
  'ഇന്നത്തെ വിൽപ്പന', 'പ്രതിദിന വിൽപ്പന',                   // Malayalam
  'ਅੱਜ ਦੀ ਵਿਕਰੀ', 'ਰੋਜ਼ਾਨਾ ਵਿਕਰੀ',                           // Punjabi
  'ଆଜିର ବିକ୍ରୟ', 'ଦୈନିକ ବିକ୍ରୟ',                             // Odia
  'আজিৰ বিক্ৰী', 'দৈনিক বিক্ৰী',                               // Assamese
  'آج کی فروخت', 'روزانہ فروخت',                            // Urdu
  'अद्यतनविक्रयः', 'दैनिकविक्रयः',                             // Sanskrit
  'आजको बिक्री', 'दैनिक बिक्री',                             // Nepali
  'ᱛᱮᱦᱮᱧᱟᱜ ᱟᱹᱠᱷᱨᱤᱧ', 'ᱫᱤᱱᱟᱹᱢ ᱟᱹᱠᱷᱨᱤᱧ',                       // Santali
]

const SALE_ACTION_KEYWORDS = [
  'sell', 'sold', 'sale',
  'વેચો', 'વેચાણ', // Gujarati
  'बेचो', 'बिक्री', // Hindi
  'विका', 'विक्री', // Marathi
  'বিক্রি', 'বেচুন', // Bengali
  'விற்பனை', 'விற்க', // Tamil
  'అమ్మండి', 'అమ్మకం', // Telugu
  'ಮಾರಿ', 'ಮಾರಾಟ', // Kannada
  'വിൽക്കുക', 'വിൽപ്പന', // Malayalam
  'ਵੇਚੋ', 'ਵਿਕਰੀ', // Punjabi
  'ବିକନ୍ତୁ', 'ବିକ୍ରୟ', // Odia
  'বিক্ৰী', // Assamese
  'فروخت', 'بیچیں', // Urdu
  'विक्रीणातु', // Sanskrit
  'बेच्नुहोस्', // Nepali
  'ᱟᱹᱠᱷᱨᱤᱧ', // Santali
]

const PURCHASE_ACTION_KEYWORDS = [
  'buy', 'purchase',
  'ખરીદો', 'ખરીદી', // Gujarati
  'खरीदो', 'खरीद', // Hindi
  'खरेदी', // Marathi
  'কিনুন', 'ক্রয়', // Bengali
  'வாங்கு', 'கொள்முதல்', // Tamil
  'కొనండి', 'కొనుగోలు', // Telugu
  'ಖರೀದಿಸಿ', 'ಖರೀದಿ', // Kannada
  'വാങ്ങുക', // Malayalam
  'ਖਰੀਦੋ', 'ਖਰੀਦ', // Punjabi
  'କିଣନ୍ତୁ', 'କ୍ରୟ', // Odia
  'ক্ৰয়', // Assamese
  'خریدیں', 'خریداری', // Urdu
  'क्रीणातु', // Sanskrit
  'खरिद्नुहोस्', // Nepali
  'ᱠᱤᱨᱤᱧ', // Santali
]

/**
 * Cleans command text by removing common punctuation and extra whitespace
 */
function normalizeQuery(text) {
  return text.trim().toLowerCase().replace(/['"?,.!।۔]/g, '')
}

/**
 * Extracts a numeric quantity from typed text (supports standard digits)
 */
function extractNumber(text) {
  const match = text.match(/(\d+(?:\.\d+)?)/)
  return match ? parseFloat(match[1]) : 1
}

/**
 * Interprets a typed command and returns structured action/data
 */
export async function interpretCommand(rawCommand, options = {}) {
  const { onNavigate } = options
  const clean = normalizeQuery(rawCommand)
  if (!clean) {
    return { status: 'empty', message: 'Please enter a command or query.' }
  }

  // 1. Check for Daily Sales Summary Query FIRST (takes precedence over generic 'sale' word)
  const isSalesSummary = SALES_SUMMARY_KEYWORDS.some((kw) => {
    const normKw = normalizeQuery(kw)
    return clean.includes(normKw) || rawCommand.toLowerCase().includes(kw.toLowerCase())
  })
  if (isSalesSummary) {
    try {
      const todayStr = new Date().toISOString().split('T')[0]
      const report = await api.getDailySalesReport({ start_date: todayStr, end_date: todayStr })
      const todayRow = (report.items || []).find((r) => r.date === todayStr) || {
        transactions_count: 0,
        net_revenue: 0,
      }
      return {
        status: 'success',
        intent: 'sales_summary',
        data: {
          date: todayStr,
          count: todayRow.transactions_count,
          amountPaise: todayRow.net_revenue,
          formattedAmount: paiseToRupees(todayRow.net_revenue),
        },
      }
    } catch (err) {
      return {
        status: 'error',
        message: `Failed to load sales summary: ${err.message}`,
      }
    }
  }

  // 2. Check for Sale Transaction Intent (Draft creation only)
  const isSaleAction = SALE_ACTION_KEYWORDS.some((kw) => clean.includes(normalizeQuery(kw)))
  const isPurchaseAction = PURCHASE_ACTION_KEYWORDS.some((kw) => clean.includes(normalizeQuery(kw)))

  if (isSaleAction || isPurchaseAction) {
    const txType = isSaleAction ? 'sale' : 'purchase'
    const qty = extractNumber(clean)

    // Remove action keywords and numbers to isolate candidate product name
    let candidateName = clean
    ;[...SALE_ACTION_KEYWORDS, ...PURCHASE_ACTION_KEYWORDS, 'kg', 'kilo', 'કિલો', 'किलो', 'packet', 'gram', 'litre'].forEach((k) => {
      candidateName = candidateName.split(normalizeQuery(k)).join(' ')
    })
    candidateName = candidateName.replace(/\d+(?:\.\d+)?/g, '').trim()

    try {
      const prodsRes = await api.getProducts({ limit: 10 })
      const allProds = prodsRes.items || []

      // Match product by name substring
      const matched = allProds.find(
        (p) =>
          candidateName &&
          (p.name.toLowerCase().includes(candidateName) ||
            candidateName.includes(p.name.toLowerCase()) ||
            (p.sku && p.sku.toLowerCase().includes(candidateName)))
      ) || allProds[0]

      if (!matched) {
        return {
          status: 'ambiguous',
          intent: 'draft_action',
          message: `Could not identify product from "${rawCommand}". Please verify product name in catalog.`,
        }
      }

      const unitPricePaise = txType === 'sale' ? matched.selling_price : matched.purchase_price
      const totalAmountPaise = Math.round(unitPricePaise * qty)

      // CREATE DRAFT ONLY — Explicit safety guardrail
      const draftPayload = {
        type: txType,
        original_instruction: rawCommand,
        items: [
          {
            product_id: matched.id,
            quantity: Math.round(qty * 1000),
            unit: matched.base_unit,
            unit_price: unitPricePaise,
          },
        ],
      }

      const draftResult = await api.createTransactionDraft(draftPayload)

      return {
        status: 'draft_created',
        intent: 'draft_action',
        txType,
        draft: draftResult,
        data: {
          productName: matched.name,
          sku: matched.sku,
          quantity: qty,
          unit: matched.base_unit,
          priceFormatted: paiseToRupees(unitPricePaise),
          totalFormatted: paiseToRupees(totalAmountPaise),
          draftId: draftResult.id,
        },
        onNavigate,
      }
    } catch (err) {
      return {
        status: 'error',
        message: `Failed to prepare draft: ${err.message}`,
      }
    }
  }

  // 3. Check for Stock Query / Product Search
  let searchWord = clean
  STOCK_KEYWORDS.forEach((kw) => {
    searchWord = searchWord.split(normalizeQuery(kw)).join(' ')
  })
  searchWord = searchWord.replace(/[0-9]/g, '').trim()

  try {
    const productsRes = await api.getProducts({ query: searchWord || undefined, limit: 5 })
    const items = productsRes.items || []

    if (items.length === 0) {
      return {
        status: 'not_found',
        intent: 'stock_query',
        query: searchWord || rawCommand,
      }
    }

    const matched = items[0]
    const qtyUnits = (matched.stock_qty / 1000).toFixed(matched.stock_qty % 1000 === 0 ? 0 : 2)

    return {
      status: 'success',
      intent: 'stock_query',
      data: {
        product: matched,
        name: matched.name,
        sku: matched.sku,
        stock: qtyUnits,
        unit: matched.base_unit,
        sellingPrice: paiseToRupees(matched.selling_price),
      },
    }
  } catch (err) {
    return {
      status: 'error',
      message: `Failed to check stock: ${err.message}`,
    }
  }
}

/**
 * Synchronous parser for offline interpretation and unit testing
 */
export function parseNaturalCommand(rawCommand, availableProducts = []) {
  const clean = normalizeQuery(rawCommand)
  if (!clean) {
    return { action: 'empty', feedback: 'Please enter a command.' }
  }

  // 1. Sales summary check FIRST
  const isSalesSummary = SALES_SUMMARY_KEYWORDS.some((kw) => {
    const normKw = normalizeQuery(kw)
    return clean.includes(normKw) || rawCommand.toLowerCase().includes(kw.toLowerCase())
  })
  if (isSalesSummary) {
    return {
      action: 'query_sales_summary',
      intent: 'sales_summary',
      feedback: "Fetching today's sales summary...",
    }
  }

  // 2. Draft action check (Strict safety guardrail: NEVER modifies stock or confirms)
  const isSale = SALE_ACTION_KEYWORDS.some((kw) => clean.includes(normalizeQuery(kw)))
  const isPurchase = PURCHASE_ACTION_KEYWORDS.some((kw) => clean.includes(normalizeQuery(kw)))
  if (isSale || isPurchase) {
    const qty = extractNumber(clean)
    let candidate = clean
    ;[...SALE_ACTION_KEYWORDS, ...PURCHASE_ACTION_KEYWORDS, 'kg', 'kilo', 'કિલો', 'किलो', 'packet', 'gram', 'litre'].forEach((k) => {
      candidate = candidate.split(normalizeQuery(k)).join(' ')
    })
    candidate = candidate.replace(/\d+(?:\.\d+)?/g, '').trim()

    const matched = availableProducts.find(
      (p) =>
        candidate &&
        (p.name.toLowerCase().includes(candidate) ||
          candidate.includes(p.name.toLowerCase()) ||
          (p.sku && p.sku.toLowerCase().includes(candidate)))
    ) || availableProducts[0]

    return {
      action: 'create_draft',
      requires_confirmation: true,
      type: isPurchase ? 'purchase' : 'sale',
      items: [
        {
          product_id: matched ? matched.id : null,
          quantity: String(qty),
          unit: matched ? matched.base_unit : 'unit',
        },
      ],
      product: matched,
      feedback: `Prepared ${isPurchase ? 'purchase' : 'sale'} draft for explicit user confirmation.`,
    }
  }

  // 3. Stock query check
  const isStockQuery = STOCK_KEYWORDS.some((kw) => clean.includes(normalizeQuery(kw)))
  if (isStockQuery) {
    let candidate = clean
    STOCK_KEYWORDS.forEach((kw) => {
      candidate = candidate.split(normalizeQuery(kw)).join(' ')
    })
    candidate = candidate.replace(/[0-9]/g, '').trim()

    const matched = availableProducts.find(
      (p) =>
        candidate &&
        (p.name.toLowerCase().includes(candidate) ||
          candidate.includes(p.name.toLowerCase()) ||
          (p.sku && p.sku.toLowerCase().includes(candidate)))
    ) || (availableProducts.length > 0 ? availableProducts[0] : null)

    return {
      action: 'query_stock',
      product: matched,
      query: candidate,
      feedback: matched ? `Stock for ${matched.name}` : `Searching stock for ${candidate}`,
    }
  }

  return {
    action: 'unknown',
    feedback: `Could not understand instruction: "${rawCommand}". Try "stock chai" or "sell 2 kg rice".`,
  }
}
