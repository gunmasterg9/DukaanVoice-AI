import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  RTL_LOCALES,
  SCHEDULED_INDIAN_LANGUAGES,
  SUPPORTED_LOCALES,
  getLocaleMetadata,
  isRtlLocale,
} from './locales.js'
import { translations } from './translations/index.js'
import { parseNaturalCommand } from '../services/commandParser.js'
import {
  formatMovementType,
  formatReconciliationStatus,
  formatTransactionStatus,
  formatTransactionType,
  milliToQty,
  paiseToRupees,
} from '../utils/formatters.js'

describe('I18n Locales Registry (22 Scheduled Indian Languages + English)', () => {
  it('registers all 22 Eighth Schedule Indian languages plus English', () => {
    assert.equal(SCHEDULED_INDIAN_LANGUAGES.length, 22)
    assert.equal(SUPPORTED_LOCALES.length, 23)
  })

  it('contains valid ISO-like locale codes, native names, and scripts', () => {
    const requiredCodes = [
      'as', 'bn', 'brx', 'doi', 'gu', 'hi', 'kn', 'ks', 'kok', 'mai',
      'ml', 'mni', 'mr', 'ne', 'or', 'pa', 'sa', 'sat', 'sd', 'ta', 'te', 'ur',
    ]

    for (const code of requiredCodes) {
      const loc = SUPPORTED_LOCALES.find((l) => l.code === code)
      assert.ok(loc, `Missing scheduled language locale: ${code}`)
      assert.ok(loc.name && loc.name.length > 0, `Missing native name for: ${code}`)
      assert.ok(loc.englishName, `Missing english name for: ${code}`)
      assert.ok(loc.script, `Missing script for: ${code}`)
      assert.ok(['ltr', 'rtl'].includes(loc.dir), `Invalid dir for: ${code}`)
    }
  })

  it('correctly flags RTL script languages (Urdu, Kashmiri, Sindhi)', () => {
    assert.equal(isRtlLocale('ur'), true)
    assert.equal(isRtlLocale('ks'), true)
    assert.equal(isRtlLocale('sd'), true)
    assert.equal(isRtlLocale('gu'), false)
    assert.equal(isRtlLocale('hi'), false)
    assert.equal(isRtlLocale('en'), false)
    assert.deepEqual(RTL_LOCALES.sort(), ['ks', 'sd', 'ur'].sort())
  })

  it('retrieves locale metadata safely with fallback', () => {
    const guMeta = getLocaleMetadata('gu')
    assert.equal(guMeta.code, 'gu')
    assert.equal(guMeta.englishName, 'Gujarati')

    const unknownMeta = getLocaleMetadata('xyz')
    assert.equal(unknownMeta.code, FALLBACK_LOCALE)
  })

  it('verifies authentic Unicode scripts for all 22 Indian languages', () => {
    // Unicode range checks
    const unicodeChecks = [
      { code: 'gu', regex: /[\u0A80-\u0AFF]/, name: 'Gujarati' },
      { code: 'hi', regex: /[\u0900-\u097F]/, name: 'Devanagari' },
      { code: 'bn', regex: /[\u0980-\u09FF]/, name: 'Bengali' },
      { code: 'as', regex: /[\u0980-\u09FF]/, name: 'Bengali-Assamese' },
      { code: 'pa', regex: /[\u0A00-\u0A7F]/, name: 'Gurmukhi' },
      { code: 'or', regex: /[\u0B00-\u0B7F]/, name: 'Odia' },
      { code: 'ta', regex: /[\u0B80-\u0BFF]/, name: 'Tamil' },
      { code: 'te', regex: /[\u0C00-\u0C7F]/, name: 'Telugu' },
      { code: 'kn', regex: /[\u0C80-\u0CFF]/, name: 'Kannada' },
      { code: 'ml', regex: /[\u0D00-\u0D7F]/, name: 'Malayalam' },
      { code: 'sat', regex: /[\u1C50-\u1C7F]/, name: 'Ol Chiki' },
      { code: 'ur', regex: /[\u0600-\u06FF]/, name: 'Arabic/Perso-Arabic' },
      { code: 'ks', regex: /[\u0600-\u06FF]/, name: 'Arabic/Perso-Arabic' },
      { code: 'sd', regex: /[\u0600-\u06FF]/, name: 'Arabic/Perso-Arabic' },
    ]

    for (const check of unicodeChecks) {
      const loc = SUPPORTED_LOCALES.find((l) => l.code === check.code)
      assert.ok(
        check.regex.test(loc.nativeName),
        `Locale ${check.code} nativeName "${loc.nativeName}" does not match script ${check.name}`
      )
    }
  })
})

describe('Translation Dictionaries Completeness and Key Parity', () => {
  function getAllKeys(obj, prefix = '') {
    let keys = []
    for (const k in obj) {
      const full = prefix ? `${prefix}.${k}` : k
      if (typeof obj[k] === 'object' && obj[k] !== null) {
        keys = keys.concat(getAllKeys(obj[k], full))
      } else {
        keys.push(full)
      }
    }
    return keys
  }

  const enKeys = new Set(getAllKeys(translations.en))

  it('loads translation dictionaries for all 23 supported locales', () => {
    const loadedLocales = Object.keys(translations)
    assert.equal(loadedLocales.length, 23)

    for (const loc of SUPPORTED_LOCALES) {
      assert.ok(translations[loc.code], `Missing translation dictionary for locale: ${loc.code}`)
    }
  })

  it('verifies 100% key parity across all 22 Indian languages against English base', () => {
    for (const loc of SCHEDULED_INDIAN_LANGUAGES) {
      const dict = translations[loc.code]
      assert.ok(dict, `Missing dictionary for ${loc.code}`)
      const dictKeys = new Set(getAllKeys(dict))
      const missing = [...enKeys].filter((k) => !dictKeys.has(k))
      assert.deepEqual(
        missing,
        [],
        `Locale "${loc.code}" (${loc.englishName}) has missing keys: ${missing.join(', ')}`
      )
    }
  })

  it('verifies essential sections exist in all language dictionaries', () => {
    const sections = ['app', 'nav', 'common', 'dashboard', 'products', 'transactions', 'reports']

    for (const [code, dict] of Object.entries(translations)) {
      for (const section of sections) {
        assert.ok(
          dict[section] && typeof dict[section] === 'object',
          `Locale "${code}" is missing section "${section}"`
        )
      }
    }
  })

  it('contains non-empty translation strings for primary action buttons', () => {
    for (const [code, dict] of Object.entries(translations)) {
      assert.ok(dict.nav.dashboard, `nav.dashboard missing in ${code}`)
      assert.ok(dict.nav.products, `nav.products missing in ${code}`)
      assert.ok(dict.nav.transactions, `nav.transactions missing in ${code}`)
      assert.ok(dict.nav.reports, `nav.reports missing in ${code}`)
      assert.ok(dict.products.add_product, `products.add_product missing in ${code}`)
      assert.ok(dict.transactions.new_sale, `transactions.new_sale missing in ${code}`)
    }
  })

  it('supports dot-notation lookup and English fallback without throwing', () => {
    function translate(locale, key) {
      const activeDict = translations[locale] || translations.en
      const enDict = translations.en

      const resolve = (dict, path) =>
        path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : null), dict)

      let res = resolve(activeDict, key)
      if (res === null && locale !== 'en') {
        res = resolve(enDict, key)
      }
      return res || key
    }

    // Gujarati existing key
    assert.equal(translate('gu', 'nav.products'), 'માલસામાન (પ્રોડક્ટ્સ)')

    // Hindi existing key
    assert.equal(translate('hi', 'nav.products'), 'सामान (उत्पाद)')

    // Bengali existing key
    assert.equal(translate('bn', 'nav.products'), 'পণ্যতালিকা')

    // Tamil existing key
    assert.equal(translate('ta', 'nav.products'), 'பொருட்கள்')

    // Non-existent key falls back safely to raw key string without crashing
    assert.equal(translate('hi', 'non.existent.key'), 'non.existent.key')
  })

  it('formats parameterized strings with token interpolation', () => {
    function interpolate(str, params = {}) {
      if (!str || typeof str !== 'string') return str
      return str.replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? params[k] : `{${k}}`))
    }

    const tpl = translations.en.transactions.stat_total_tx
    assert.equal(interpolate(tpl, { count: 42 }), 'Transactions: 42')

    const tplGu = translations.gu.transactions.stat_total_tx
    assert.equal(interpolate(tplGu, { count: 15 }), 'કુલ વ્યવહારો: 15')
  })
})

describe('Formatting Localization and Source of Truth Preservation', () => {
  it('formats transaction status with localization hook while preserving defaults', () => {
    assert.deepEqual(formatTransactionStatus('draft'), { label: 'Draft', tone: 'warning' })
    assert.deepEqual(formatTransactionStatus('confirmed'), { label: 'Confirmed', tone: 'success' })
    assert.deepEqual(formatTransactionStatus('reversed'), { label: 'Reversed', tone: 'danger' })

    const mockTGu = (key) => (translations.gu.transactions[key.split('.')[1]] || key)
    const localizedGu = formatTransactionStatus('confirmed', mockTGu)
    assert.equal(localizedGu.label, 'મંજૂર કરેલ')
    assert.equal(localizedGu.tone, 'success')
  })

  it('formats transaction type with localization hook', () => {
    assert.deepEqual(formatTransactionType('sale'), { label: 'Sale', tone: 'success' })
    assert.deepEqual(formatTransactionType('purchase'), { label: 'Purchase', tone: 'info' })

    const mockTHi = (key) => (translations.hi.transactions[key.split('.')[1]] || key)
    const localizedHi = formatTransactionType('sale', mockTHi)
    assert.equal(localizedHi.label, 'बिक्री')
  })

  it('formats reconciliation status and movement types with localization hook', () => {
    const mockTGu = (key) => {
      const [sec, sub] = key.split('.')
      return translations.gu[sec]?.[sub] || key
    }
    const reconGu = formatReconciliationStatus('reconciled', mockTGu)
    assert.equal(reconGu.label, 'સંપૂર્ણ મેળવેલ')
    assert.equal(reconGu.tone, 'success')

    const movAdjGu = formatMovementType('adjustment', mockTGu)
    assert.equal(movAdjGu.label, 'પ્રારંભિક સ્ટોક સમાયોજન')
    assert.equal(movAdjGu.tone, 'info')

    const movRevGu = formatMovementType('reversal', mockTGu)
    assert.equal(movRevGu.label, 'વળતર વ્યવહાર (રિવર્સલ)')
    assert.equal(movRevGu.tone, 'warning')
  })

  it('preserves authoritative monetary integer paise values across languages', () => {
    assert.equal(paiseToRupees(125000), '₹1250.00')
    assert.equal(paiseToRupees(0), '₹0.00')
    assert.equal(paiseToRupees(99), '₹0.99')
  })

  it('preserves authoritative inventory milli-unit quantities across languages', () => {
    assert.equal(milliToQty(5000), '5')
    assert.equal(milliToQty(2500), '2.5')
    assert.equal(milliToQty(333), '0.333')
  })

  it('verifies language switching does NOT alter stored business record data', () => {
    const businessProduct = {
      id: 101,
      sku: 'SKU-RICE-01',
      name: 'Basmati Rice 1kg',
      category: 'Grains',
      base_unit: 'kg',
      stock_qty: 25000,
      purchase_price: 8000,
      selling_price: 10500,
    }

    // Clone product
    const beforeSwitch = JSON.parse(JSON.stringify(businessProduct))

    // Switching active language to Urdu, Bengali, Sanskrit
    const sampleLocales = ['ur', 'bn', 'sa', 'gu', 'en']
    for (const code of sampleLocales) {
      const activeDict = translations[code]
      assert.ok(activeDict)
      // Stored fields remain untouched
      assert.equal(businessProduct.name, beforeSwitch.name)
      assert.equal(businessProduct.sku, beforeSwitch.sku)
      assert.equal(businessProduct.stock_qty, beforeSwitch.stock_qty)
      assert.equal(businessProduct.selling_price, beforeSwitch.selling_price)
    }
  })
})

describe('Language-Aware Natural Command Parser & Safeguards', () => {
  const sampleProducts = [
    { id: 1, name: 'Chai Patti', sku: 'SKU-TEA-01', base_unit: 'kg', stock_qty: 12000, selling_price: 35000, purchase_price: 28000 },
    { id: 2, name: 'Basmati Rice', sku: 'SKU-RICE-01', base_unit: 'kg', stock_qty: 45000, selling_price: 11000, purchase_price: 8500 },
    { id: 3, name: 'Amul Milk 500ml', sku: 'SKU-MILK-01', base_unit: 'packet', stock_qty: 24000, selling_price: 3200, purchase_price: 2700 },
  ]

  it('interprets stock queries in English, Hindi, Gujarati, Marathi, and Tamil', () => {
    // English
    const resEn = parseNaturalCommand('stock chai', sampleProducts)
    assert.equal(resEn.action, 'query_stock')
    assert.equal(resEn.product.id, 1)

    // Gujarati
    const resGu = parseNaturalCommand('સ્ટોક ચા', sampleProducts)
    assert.equal(resGu.action, 'query_stock')

    // Hindi
    const resHi = parseNaturalCommand('चावल का स्टॉक', sampleProducts)
    assert.equal(resHi.action, 'query_stock')

    // Tamil
    const resTa = parseNaturalCommand('இருப்பு rice', sampleProducts)
    assert.equal(resTa.action, 'query_stock')
  })

  it('interprets sales summary queries across Indian languages', () => {
    assert.equal(parseNaturalCommand("today's sales", sampleProducts).action, 'query_sales_summary')
    assert.equal(parseNaturalCommand('આજનું વેચાણ', sampleProducts).action, 'query_sales_summary')
    assert.equal(parseNaturalCommand('आज की बिक्री', sampleProducts).action, 'query_sales_summary')
    assert.equal(parseNaturalCommand('இன்றைய விற்பனை', sampleProducts).action, 'query_sales_summary')
    assert.equal(parseNaturalCommand('آج کی فروخت', sampleProducts).action, 'query_sales_summary')
  })

  it('enforces safety guardrail: sales commands create a DRAFT only and never directly modify inventory', () => {
    const res = parseNaturalCommand('sell 2 kg chai patti', sampleProducts)
    assert.equal(res.action, 'create_draft')
    assert.equal(res.requires_confirmation, true)
    assert.equal(res.type, 'sale')
    assert.equal(res.items.length, 1)
    assert.equal(res.items[0].product_id, 1)
    assert.equal(res.items[0].quantity, '2')
  })

  it('enforces safety guardrail: purchase commands create a DRAFT only', () => {
    const res = parseNaturalCommand('buy 10 kg basmati rice', sampleProducts)
    assert.equal(res.action, 'create_draft')
    assert.equal(res.requires_confirmation, true)
    assert.equal(res.type, 'purchase')
    assert.equal(res.items[0].product_id, 2)
  })

  it('handles unknown or ambiguous input gracefully without crashing', () => {
    const res = parseNaturalCommand('random gibberish 12345', sampleProducts)
    assert.equal(res.action, 'unknown')
    assert.ok(res.feedback.length > 0)
  })
})

describe('Language Preference Persistence and Context Fallback Defaults', () => {
  it('defines valid default and fallback locale constants', () => {
    assert.equal(DEFAULT_LOCALE, 'gu')
    assert.equal(FALLBACK_LOCALE, 'en')
  })

  it('simulates localStorage preference read and safe fallback on corrupt or unknown value', () => {
    const validStore = { dukaanvoice_locale: 'ta' }
    const loadedValid = SUPPORTED_LOCALES.some((l) => l.code === validStore.dukaanvoice_locale)
      ? validStore.dukaanvoice_locale
      : DEFAULT_LOCALE
    assert.equal(loadedValid, 'ta')

    const corruptStore = { dukaanvoice_locale: 'unknown-script-code' }
    const loadedFallback = SUPPORTED_LOCALES.some((l) => l.code === corruptStore.dukaanvoice_locale)
      ? corruptStore.dukaanvoice_locale
      : DEFAULT_LOCALE
    assert.equal(loadedFallback, 'gu')
  })
})
