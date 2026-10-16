import { useState, useRef, useEffect } from 'react'
import { useI18n } from './I18nContext'

export function LanguageSelector() {
  const { locale, setLocale, config, locales } = useI18n()
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const dropdownRef = useRef(null)
  const searchInputRef = useRef(null)
  const listRef = useRef(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Filter locales
  const filteredLocales = locales.filter((l) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      l.name.toLowerCase().includes(q) ||
      l.nativeName.toLowerCase().includes(q) ||
      l.code.toLowerCase().includes(q) ||
      (l.region && l.region.toLowerCase().includes(q))
    )
  })


  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const items = listRef.current.querySelectorAll('.language-option-btn')
      if (items[highlightedIndex]) {
        items[highlightedIndex].scrollIntoView({ block: 'nearest' })
      }
    }
  }, [highlightedIndex, isOpen])

  const handleSelect = (code) => {
    setLocale(code)
    setIsOpen(false)
    setSearch('')
  }

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        setIsOpen(true)
      }
      return
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      setIsOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((prev) => (prev + 1) % (filteredLocales.length || 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((prev) => (prev - 1 + filteredLocales.length) % (filteredLocales.length || 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredLocales[highlightedIndex]) {
        handleSelect(filteredLocales[highlightedIndex].code)
      }
    }
  }

  return (
    <div className="language-selector-wrapper" ref={dropdownRef} onKeyDown={handleKeyDown}>
      <button
        type="button"
        className="language-selector-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label="Select interface language"
        title="Change Language / ભાષા બદલો"
        id="language-selector-button"
      >
        <span className="lang-globe" aria-hidden="true">🌐</span>
        <span className="lang-name-active">{config.nativeName}</span>
        <span className="lang-code-tag">({config.code.toUpperCase()})</span>
        <span className={`lang-arrow ${isOpen ? 'open' : ''}`} aria-hidden="true">▼</span>
      </button>

      {isOpen && (
        <div
          className="language-menu-dropdown"
          role="listbox"
          aria-labelledby="language-selector-button"
        >
          <div className="language-menu-search">
            <input
              ref={searchInputRef}
              type="text"
              className="language-search-input"
              placeholder="Search language / भाषा खोजें..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setHighlightedIndex(0)
              }}
              autoFocus
              aria-label="Search languages by name or code"
            />
          </div>
          <div className="language-menu-list" ref={listRef}>
            {filteredLocales.map((loc, idx) => {
              const isSelected = loc.code === locale
              const isHighlighted = idx === highlightedIndex
              return (
                <button
                  key={loc.code}
                  type="button"
                  className={`language-option-btn ${isSelected ? 'active' : ''} ${isHighlighted ? 'highlighted' : ''}`}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(loc.code)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                >
                  <div className="language-text-group">
                    <span className="language-native-name">{loc.nativeName}</span>
                    <span className="language-sub-label">
                      {loc.name} {loc.region ? `• ${loc.region}` : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {loc.dir === 'rtl' && <span className="lang-rtl-badge">RTL</span>}
                    <span className="lang-code-tag" style={{ fontSize: '0.72rem', opacity: 0.8 }}>
                      {loc.code}
                    </span>
                  </div>
                </button>
              )
            })}
            {filteredLocales.length === 0 && (
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No languages found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
