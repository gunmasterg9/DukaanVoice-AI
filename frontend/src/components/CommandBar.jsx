import { useState, useEffect, useRef } from 'react'
import { useI18n } from '../i18n/I18nContext'
import { interpretCommand } from '../services/commandParser'
import { voiceService } from '../services/voiceService'

// Maps language code to standard BCP-47 speech recognition locale tag
const LOCALE_TO_SPEECH_TAG = {
  gu: 'gu-IN',
  hi: 'hi-IN',
  en: 'en-IN',
  bn: 'bn-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  mr: 'mr-IN',
  kn: 'kn-IN',
  ml: 'ml-IN',
  pa: 'pa-IN',
  or: 'or-IN',
  ur: 'ur-IN',
  as: 'as-IN',
  ks: 'ks-IN',
  sd: 'sd-IN',
  sa: 'sa-IN',
  ne: 'ne-NP',
  mai: 'mai-IN',
  kok: 'kok-IN',
  doi: 'doi-IN',
  brx: 'brx-IN',
  mni: 'mni-IN',
  sat: 'sat-IN',
}

export function CommandBar({ onNavigate }) {
  const { t, locale, config } = useI18n()
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [isListening, setIsListening] = useState(false)
  const voiceSupported = typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  const recognitionRef = useRef(null)
  const handleExecuteRef = useRef(null)

  // Initialize Speech Recognition if supported
  useEffect(() => {
    const SpeechRecognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition()
      recognition.continuous = false
      recognition.interimResults = false
      recognition.lang = LOCALE_TO_SPEECH_TAG[locale] || 'en-IN'

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript
        setQuery(transcript)
        setIsListening(false)
        handleExecuteRef.current?.(transcript)
      }

      recognition.onerror = () => {
        setIsListening(false)
      }

      recognition.onend = () => {
        setIsListening(false)
      }

      recognitionRef.current = recognition
    }
  }, [locale])

  const toggleListening = () => {
    if (!voiceSupported) {
      alert(t('commandBar.voice_unavailable'))
      return
    }

    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
    } else {
      voiceService.cancel()
      try {
        if (recognitionRef.current) {
          recognitionRef.current.lang = LOCALE_TO_SPEECH_TAG[locale] || 'en-IN'
          recognitionRef.current.start()
          setIsListening(true)
        }
      } catch {
        setIsListening(false)
      }
    }
  }

  const speakText = (text) => {
    voiceService.speak(text, locale)
  }

  const handleExecute = async (inputQuery) => {
    const textToRun = inputQuery !== undefined ? inputQuery : query
    if (!textToRun.trim()) return

    setLoading(true)
    setResult(null)

    try {
      const res = await interpretCommand(textToRun, { onNavigate })
      setResult(res)

      // Optional text-to-speech feedback for successful queries
      if (res.status === 'success' && res.intent === 'stock_query') {
        const speechMsg = `${res.data.name}, stock ${res.data.stock} ${res.data.unit}`
        speakText(speechMsg)
      }
    } catch (err) {
      setResult({ status: 'error', message: err.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    handleExecuteRef.current = handleExecute
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    handleExecute()
  }

  return (
    <div className="command-bar-container">
      <div className="command-bar-header">
        <div className="command-bar-title-row">
          <span className="command-bar-badge">{t('commandBar.badge')}</span>
          <span className="command-bar-offline">{t('commandBar.badge_offline')}</span>
          <span className="command-bar-current-lang">{config.nativeName} ({config.name})</span>
        </div>
      </div>

      <form className="command-bar-form" onSubmit={handleSubmit}>
        <div className="command-input-wrapper">
          <input
            type="text"
            className="command-text-input command-bar-input"
            placeholder={t('commandBar.placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={loading}
            aria-label="Multilingual Command Input"
          />
          <button
            type="button"
            className={`command-mic-btn ${isListening ? 'listening' : ''}`}
            onClick={toggleListening}
            title={voiceSupported ? t('commandBar.voice_btn_title') : t('commandBar.voice_unavailable')}
            aria-label="Toggle voice input"
          >
            {isListening ? '🔴' : '🎤'}
          </button>
        </div>

        <button type="submit" className="btn btn-primary command-submit-btn" disabled={loading || !query.trim()}>
          {loading ? t('common.loading') : t('commandBar.btn_submit')}
        </button>
      </form>

      {isListening && (
        <div className="command-listening-status" aria-live="polite">
          <span className="pulse-dot" /> {t('commandBar.listening')}
        </div>
      )}

      {/* Result Display */}
      {result && (
        <div className={`command-result-card tone-${result.status}`}>
          {result.status === 'success' && result.intent === 'stock_query' && (
            <div className="command-result-body">
              <div className="command-result-icon">📦</div>
              <div className="command-result-content">
                <h4>
                  {t('commandBar.query_stock_result', {
                    name: result.data.name,
                    sku: result.data.sku,
                    stock: result.data.stock,
                    unit: result.data.unit,
                  })}
                </h4>
                <p className="command-result-sub">
                  Selling Price: {result.data.sellingPrice}
                </p>
              </div>
            </div>
          )}

          {result.status === 'success' && result.intent === 'sales_summary' && (
            <div className="command-result-body">
              <div className="command-result-icon">📊</div>
              <div className="command-result-content">
                <h4>
                  {t('commandBar.summary_sales_result', {
                    amount: result.data.formattedAmount,
                    count: result.data.count,
                  })}
                </h4>
                <p className="command-result-sub">
                  Date: {result.data.date} (Confirmed Net Sales)
                </p>
              </div>
            </div>
          )}

          {result.status === 'success' && result.intent === 'draft_created' && (
            <div className="command-result-body">
              <div className="command-result-icon">📝</div>
              <div className="command-result-content">
                <h4>
                  {result.txType === 'sale'
                    ? t('commandBar.draft_created_sale', {
                        qty: result.data.quantity,
                        unit: result.data.unit,
                        name: result.data.productName,
                        price: result.data.priceFormatted,
                        total: result.data.totalFormatted,
                      })
                    : t('commandBar.draft_created_purchase', {
                        qty: result.data.quantity,
                        unit: result.data.unit,
                        name: result.data.productName,
                        price: result.data.priceFormatted,
                        total: result.data.totalFormatted,
                      })}
                </h4>
                <p className="command-result-sub">
                  Draft #{result.data.draftId} created in ledger. Current stock remains unchanged until explicit confirmation.
                </p>
                {onNavigate && (
                  <button
                    type="button"
                    className="btn btn-success btn-sm"
                    style={{ marginTop: '8px' }}
                    onClick={() => onNavigate('transactions')}
                  >
                    {t('commandBar.confirm_draft_btn')} →
                  </button>
                )}
              </div>
            </div>
          )}

          {result.status === 'not_found' && (
            <div className="command-result-body">
              <div className="command-result-icon">🔍</div>
              <div className="command-result-content">
                <h4>{t('commandBar.product_not_found', { query: result.query })}</h4>
              </div>
            </div>
          )}

          {result.status === 'ambiguous' && (
            <div className="command-result-body">
              <div className="command-result-icon">⚠️</div>
              <div className="command-result-content">
                <h4>{result.message}</h4>
              </div>
            </div>
          )}

          {result.status === 'error' && (
            <div className="command-result-body">
              <div className="command-result-icon">❌</div>
              <div className="command-result-content">
                <h4>{result.message}</h4>
              </div>
            </div>
          )}

          <div className="command-guardrail-notice">
            <small>🔒 {t('commandBar.guardrail_note')}</small>
          </div>
        </div>
      )}
    </div>
  )
}
