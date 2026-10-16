import { useState, useRef, useEffect } from 'react'
import { useI18n } from './I18nContext'

export function LanguageSelector() {
  const { locale, setLocale, config, locales } = useI18n()
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const dropdownRef = useRef(null)

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

  const handleSelect = (code) => {
    setLocale(code)
    setIsOpen(false)
    setSearch('')
  }

  return (
    <div className="language-selector-wrapper" ref={dropdownRef}>
      <button
        type="button"
        className="language-selector-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label="Select interface language"
        title="Change Language"
      >
        <span className="lang-icon" aria-hidden="true">🌐</span>
        <span className="lang-current-native">{config.nativeName}</span>
        <span className="lang-current-code">({config.code.toUpperCase()})</span>
        <span className="lang-caret" aria-hidden="true">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="language-dropdown-menu" role="listbox">
          <div className="lang-search-box">
            <input
              type="text"
              className="lang-search-input"
              placeholder="Search language / भाषा खोजें..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              aria-label="Search languages"
            />
          </div>
          <div className="lang-options-list">
            {filteredLocales.map((loc) => {
              const isSelected = loc.code === locale
              return (
                <button
                  key={loc.code}
                  type="button"
                  className={`lang-option-item ${isSelected ? 'selected' : ''}`}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(loc.code)}
                >
                  <div className="lang-option-text">
                    <span className="lang-native-label">{loc.nativeName}</span>
                    <span className="lang-english-label">{loc.name}</span>
                  </div>
                  <div className="lang-meta-tags">
                    {loc.dir === 'rtl' && <span className="lang-rtl-tag">RTL</span>}
                    <span className="lang-code-tag">{loc.code}</span>
                  </div>
                </button>
              )
            })}
            {filteredLocales.length === 0 && (
              <div className="lang-no-results">No languages found</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
