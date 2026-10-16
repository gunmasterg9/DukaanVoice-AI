/* oxlint-disable react/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { DEFAULT_LOCALE, FALLBACK_LOCALE, SUPPORTED_LOCALES, getLocaleConfig } from './locales'
import { TRANSLATIONS } from './translations'

const I18nContext = createContext(null)

const STORAGE_KEY = 'dukaanvoice_locale'

/**
 * Resolves a nested object path like 'products.field_name'
 */
function resolveKey(obj, path) {
  if (!obj || !path) return undefined
  const parts = path.split('.')
  let current = obj
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part]
    } else {
      return undefined
    }
  }
  return typeof current === 'string' ? current : undefined
}

/**
 * Interpolates variables in format {name} with provided params object
 */
function interpolate(template, params) {
  if (!template || !params || typeof params !== 'object') return template
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    return params[key] !== undefined && params[key] !== null ? String(params[key]) : `{${key}}`
  })
}

export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored && SUPPORTED_LOCALES.some((l) => l.code === stored)) {
        return stored
      }
    } catch {
      // LocalStorage access may be restricted
    }
    return DEFAULT_LOCALE
  })

  const setLocale = (newLocale) => {
    if (SUPPORTED_LOCALES.some((l) => l.code === newLocale)) {
      setLocaleState(newLocale)
      try {
        localStorage.setItem(STORAGE_KEY, newLocale)
      } catch {
        // ignore storage errors
      }
    }
  }

  const config = useMemo(() => getLocaleConfig(locale), [locale])

  // Update HTML tag attributes whenever locale or direction changes
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale
      document.documentElement.dir = config.dir
      document.body.setAttribute('data-locale', locale)
      document.body.setAttribute('data-dir', config.dir)
    }
  }, [locale, config])

  /**
   * Translate key with fallback to English, then key itself
   */
  const t = useMemo(() => {
    const currentDict = TRANSLATIONS[locale] || {}
    const fallbackDict = TRANSLATIONS[FALLBACK_LOCALE] || {}

    return (key, params) => {
      let text = resolveKey(currentDict, key)
      if (text === undefined) {
        text = resolveKey(fallbackDict, key)
      }
      if (text === undefined) {
        // Graceful fallback to raw key to avoid any crash
        text = key
      }
      return interpolate(text, params)
    }
  }, [locale])

  const contextValue = useMemo(
    () => ({
      locale,
      setLocale,
      config,
      isRTL: config.dir === 'rtl',
      t,
      locales: SUPPORTED_LOCALES,
    }),
    [locale, config, t]
  )

  return <I18nContext.Provider value={contextValue}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    // Provide a safe fallback if used outside provider
    const fallbackCfg = getLocaleConfig(DEFAULT_LOCALE)
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      config: fallbackCfg,
      isRTL: false,
      t: (key, params) => interpolate(resolveKey(TRANSLATIONS.en, key) || key, params),
      locales: SUPPORTED_LOCALES,
    }
  }
  return ctx
}
