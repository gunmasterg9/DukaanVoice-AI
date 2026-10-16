import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  FALLBACK_LOCALE,
  RTL_LOCALES,
  SCHEDULED_INDIAN_LANGUAGES,
  SUPPORTED_LOCALES,
  getLocaleMetadata,
  isRtlLocale,
} from './locales.js'
import { translations } from './translations/index.js'
import { parseNaturalCommand } from '../services/commandParser.js'
import { formatTransactionStatus, formatTransactionType, paiseToRupees, milliToQty } from '../utils/formatters.js'

describe('I18n Locales Registry (22 Scheduled Indian Languages + English)', () => {
  it('registers all 22 Eighth Schedule Indian languages plus English', () => {
    assert.equal(SCHEDULED_INDIAN_LANGUAGES.length, 22)
    assert.equal(SUPPORTED_LOCALES.length, 23)
  })

  it('contains valid ISO-like locale codes and native names', () => {
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
    assert.deepEqual(RTL_LOCALES, ['ur', 'ks', 'sd'])
  })

  it('retrieves locale metadata safely with fallback', () => {
    const guMeta = getLocaleMetadata('gu')
    assert.equal(guMeta.code, 'gu')
    assert.equal(guMeta.englishName, 'Gujarati')

    const unknownMeta = getLocaleMetadata('xyz')
    assert.equal(unknownMeta.code, FALLBACK_LOCALE)
  })
})

describe('Translation Dictionaries Completeness and Fallbacks', () => {
  it('loads translation dictionaries for all 23 supported locales', () => {
    const loadedLocales = Object.keys(translations)
    assert.equal(loadedLocales.length, 23)

    for (const loc of SUPPORTED_LOCALES) {
      assert.ok(translations[loc.code], `Missing translation dictionary for locale: ${loc.code}`)
    }
  })

  it('verifies essential sections exist in all language dictionaries', () => {
    const sections = ['app', 'nav', 'common', 'dashboard', 'products', 'transactions', 'reports']

    for (const [code, dict] of Object.entries(translations)) {
      for (const section of sections) {
        assert.ok(
          dict[section] && typeof dict[section] === 'object',
          `Locale "${code}" is missing section "${section}"`,
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

  it('supports dot-notation lookup and English fallback', () => {
    // Helper to simulate context resolver
    function translate(locale, key) {
      const activeDict = translations[locale] || translations.en
      const enDict = translations.en

      const resolve = (dict, path) =>
        path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? part in acc ? acc[part] : null : null), dict)

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

    // Non-existent key falls back safely without crashing
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
    // English default
    assert.deepEqual(formatTransactionStatus('draft'), { label: 'Draft', tone: 'warning' })
    assert.deepEqual(formatTransactionStatus('confirmed'), { label: 'Confirmed', tone: 'success' })
    assert.deepEqual(formatTransactionStatus('reversed'), { label: 'Reversed', tone: 'danger' })

    // Localized with t function for Gujarati
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
})

describe('Language-Aware Natural Command Parser & Safeguards', () => {
  const sampleProducts = [
    { id: 1, name: 'Chai Patti', sku: 'SKU-TEA-01', base_unit: 'kg', stock_qty: 12000, selling_price: 35000, purchase_price: 28000 },
    { id: 2, name: 'Basmati Rice', sku: 'SKU-RICE-01', base_unit: 'kg', stock_qty: 45000, selling_price: 11000, purchase_price: 8500 },
    { id: 3, name: 'Amul Milk 500ml', sku: 'SKU-MILK-01', base_unit: 'packet', stock_qty: 24000, selling_price: 3200, purchase_price: 2700 },
  ]

  it('interprets stock queries in English, Hindi, and Gujarati', () => {
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
  })

  it('interprets sales summary queries across languages', () => {
    assert.equal(parseNaturalCommand("today's sales", sampleProducts).action, 'query_sales_summary')
    assert.equal(parseNaturalCommand('આજનું વેચાણ', sampleProducts).action, 'query_sales_summary')
    assert.equal(parseNaturalCommand('आज की बिक्री', sampleProducts).action, 'query_sales_summary')
    assert.equal(parseNaturalCommand('இன்றைய விற்பனை', sampleProducts).action, 'query_sales_summary')
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

  it('handles unknown or ambiguous input gracefully without crashing', () => {
    const res = parseNaturalCommand('random gibberish 12345', sampleProducts)
    assert.equal(res.action, 'unknown')
    assert.ok(res.feedback.length > 0)
  })
})
