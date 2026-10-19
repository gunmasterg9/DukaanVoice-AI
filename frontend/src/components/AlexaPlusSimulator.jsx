import { useState, useEffect, useRef } from 'react'
import { mcpClient } from '../services/mcpClient'
import { voiceService } from '../services/voiceService'
import { useI18n } from '../i18n/I18nContext'

let msgCounter = 0
function createMsg(sender, text, extras = {}) {
  msgCounter += 1
  return {
    id: `${sender}-${Date.now()}-${msgCounter}`,
    sender,
    text,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    ...extras,
  }
}

export function AlexaPlusSimulator() {
  const { locale } = useI18n()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [conversationState, setConversationState] = useState('idle') // idle, processing, awaiting_confirmation, cancelled, completed, error
  const [mcpStatus, setMcpStatus] = useState({ connected: false, sessionId: null, tools: [] })
  const [activeProposal, setActiveProposal] = useState(null)
  const [isListening, setIsListening] = useState(false)
  const [voiceState, setVoiceState] = useState(() => ({
    isSpeaking: voiceService.isSpeaking,
    muted: voiceService.muted,
    rate: voiceService.rate,
    provider: voiceService.getActiveProviderLabel(locale),
    pollyAvailable: voiceService.pollyStatus.available,
    availableVoices: voiceService.getAvailableBrowserVoices(locale),
    selectedVoiceURI: voiceService.selectedVoiceURI,
    previewState: voiceService.previewState,
  }))
  const recognitionRef = useRef(null)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const handleSendRef = useRef(null)

  const isProcessing = conversationState === 'processing'
  const voiceSupported = typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, activeProposal, conversationState])

  // Synchronize with VoiceService (Polly / Browser Natural TTS)
  useEffect(() => {
    voiceService.checkBackendPollyStatus()
    const unsub = voiceService.subscribe((vs) => {
      setVoiceState({
        isSpeaking: vs.isSpeaking,
        muted: vs.muted,
        rate: vs.rate,
        provider: vs.getActiveProviderLabel(locale),
        pollyAvailable: vs.pollyStatus.available,
        availableVoices: vs.getAvailableBrowserVoices(locale),
        selectedVoiceURI: vs.selectedVoiceURI,
        previewState: vs.previewState,
      })
    })
    return () => {
      unsub()
      voiceService.cancel()
    }
  }, [locale])

  // Initialize MCP Connection on mount
  useEffect(() => {
    let mounted = true
    async function connectMcp() {
      try {
        const initRes = await mcpClient.initialize()
        if (mounted && initRes.success) {
          setMcpStatus({
            connected: true,
            sessionId: initRes.sessionId,
            tools: mcpClient.tools || [],
          })
          setMessages([
            createMsg(
              'assistant',
              'Namaste! I am DukaanVoice for Alexa+ (Simulated Experience). You can ask questions in English, Gujarati (ગુજરાતી), or Hindi (हिन्दी) to check stock, propose sales, receive incoming purchases, or view daily reports.'
            ),
          ])
        } else if (mounted) {
          setMcpStatus({ connected: false, error: initRes.error || 'Failed to initialize MCP', tools: [] })
        }
      } catch (err) {
        if (mounted) {
          setMcpStatus({ connected: false, error: err.message, tools: [] })
        }
      }
    }
    connectMcp()
    return () => {
      mounted = false
    }
  }, [])

  // Web Speech recognition setup
  useEffect(() => {
    const SpeechRecognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition()
      recognition.continuous = false
      recognition.interimResults = true
      recognition.lang = locale === 'gu' ? 'gu-IN' : locale === 'hi' ? 'hi-IN' : 'en-IN'

      recognition.onresult = (event) => {
        let interim = ''
        let final = ''
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i]
          if (item.isFinal) {
            final += item[0].transcript
          } else {
            interim += item[0].transcript
          }
        }
        if (interim) {
          setInput(interim)
        }
        if (final) {
          const cleanFinal = final.trim()
          setInput(cleanFinal)
          setIsListening(false)
          handleSendRef.current?.(cleanFinal)
        }
      }

      recognition.onerror = (e) => {
        setIsListening(false)
        if (e.error === 'not-allowed') {
          setMessages((prev) => [
            ...prev,
            createMsg('assistant', '⚠️ Microphone access was denied. Please allow microphone permissions in your browser to speak commands.', { isError: true }),
          ])
        }
      }
      recognition.onend = () => setIsListening(false)
      recognitionRef.current = recognition
    }
  }, [locale])

  const toggleMic = () => {
    voiceService.cancel()
    if (!voiceSupported) {
      alert('Speech recognition is not supported in this browser environment. Please use typed input.')
      return
    }

    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
    } else {
      try {
        recognitionRef.current?.start()
        setIsListening(true)
      } catch {
        setIsListening(false)
      }
    }
  }

  const speak = (text) => {
    voiceService.speak(text, locale)
  }

  const handleConfirmProposal = async () => {
    if (!activeProposal || isProcessing) return
    voiceService.cancel()
    setConversationState('processing')

    try {
      const confirmRes = await mcpClient.confirmProposal(
        activeProposal.toolName,
        activeProposal.draftId,
        activeProposal.productName,
        activeProposal.quantity,
        activeProposal.unit
      )

      if (confirmRes.status === 'error') {
        setMessages((prev) => [
          ...prev,
          createMsg('assistant', `⚠️ Confirmation rejected: ${confirmRes.message}`, { isError: true }),
        ])
        setConversationState('error')
        return
      }

      const successMsg = confirmRes.message || `Action confirmed! Updated stock is now ${confirmRes.current_stock ?? confirmRes.stock_after}.`

      setMessages((prev) => [
        ...prev,
        createMsg('user', `Confirm action (Draft #${activeProposal.draftId})`),
        createMsg('assistant', `✅ ${successMsg}`, { isSuccess: true }),
      ])
      speak(successMsg)
      setActiveProposal(null)
      setConversationState('completed')
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        createMsg('assistant', `⚠️ Could not confirm action: ${err.message}`, { isError: true }),
      ])
      setConversationState('error')
    }
  }

  const handleCancelProposal = () => {
    if (!activeProposal || isProcessing) return
    voiceService.cancel()
    const cancelledName = activeProposal.productName
    const draftId = activeProposal.draftId
    const cancelMsg = `Proposed action for ${cancelledName} (Draft #${draftId}) was cancelled. No changes were made to store stock.`

    setActiveProposal(null)
    setConversationState('cancelled')

    setMessages((prev) => [
      ...prev,
      createMsg('user', `Cancel action (Draft #${draftId})`),
      createMsg('assistant', `🛑 ${cancelMsg}`),
    ])
    speak(cancelMsg)
  }

  const handleSend = async (customText) => {
    if (isProcessing) return
    voiceService.cancel()
    const query = (customText !== undefined ? customText : input).trim()
    if (!query) return

    setInput('')
    setMessages((prev) => [...prev, createMsg('user', query)])
    setConversationState('processing')

    try {
      const res = await mcpClient.processShopkeeperQuery(query, locale)

      // 1. User confirmed via voice or text
      if (res.type === 'confirmation') {
        if (activeProposal) {
          await handleConfirmProposal()
        } else {
          setMessages((prev) => [
            ...prev,
            createMsg('assistant', 'There is no pending proposal to confirm. You can say "Sell 5 packets of biscuits" or "How many packets of biscuits are left?".'),
          ])
          setConversationState('idle')
        }
        return
      }

      // 2. User cancelled via voice or text
      if (res.type === 'cancellation') {
        if (activeProposal) {
          handleCancelProposal()
        } else {
          setMessages((prev) => [
            ...prev,
            createMsg('assistant', 'There is no pending proposal to cancel.'),
          ])
          setConversationState('idle')
        }
        return
      }

      // 3. Clarification requested (e.g. missing quantity or ambiguous request)
      if (res.type === 'clarification') {
        setMessages((prev) => [...prev, createMsg('assistant', `ℹ️ ${res.message}`)])
        speak(res.message)
        setConversationState('idle')
        return
      }

      // 4. Sale or Purchase Proposal (two-step confirmation flow)
      if (res.type === 'sale_proposal' || res.type === 'purchase_proposal') {
        const pData = res.data
        if (pData.status === 'error') {
          const errText = `⚠️ ${pData.message || pData.error}`
          setMessages((prev) => [...prev, createMsg('assistant', errText, { isError: true })])
          speak(pData.message || pData.error)
          setConversationState('error')
        } else {
          // Action proposal created without mutating confirmed stock
          setActiveProposal({
            toolName: res.tool,
            draftId: pData.draft_id,
            productName: pData.product_name,
            sku: pData.sku,
            quantity: pData.quantity,
            unit: pData.unit,
            totalFormatted: pData.total_amount_rupees || pData.total_cost_rupees,
            currentStock: pData.current_stock,
            proposedStock: pData.proposed_stock,
            baseUnit: pData.base_unit,
            type: res.type,
            userQuery: query,
          })

          setConversationState('awaiting_confirmation')
          setMessages((prev) => [
            ...prev,
            createMsg('assistant', pData.message, { hasProposal: true, draftId: pData.draft_id }),
          ])
          speak(pData.message)
        }
      } else if (res.type === 'inventory_inquiry') {
        const inv = res.data
        let reply = ''
        if (!inv.products || inv.products.length === 0) {
          reply = `No products found matching "${res.searchQuery || query}". Please check the product catalog.`
        } else if (inv.products.length === 1) {
          const p = inv.products[0]
          const cleanName = p.name.replace(/\b\d{8,}\b/g, '').trim()
          reply = `I found ${cleanName}. Current stock is ${p.stock_quantity} ${p.base_unit} at ${p.selling_price_rupees} per ${p.base_unit}.${p.is_low_stock ? ' (⚠️ Low Stock Alert)' : ''}`
        } else {
          const listStr = inv.products.slice(0, 3).map((p) => `${p.name.replace(/\b\d{8,}\b/g, '').trim()}: ${p.stock_quantity} ${p.base_unit}`).join(', ')
          reply = `Found ${inv.products.length} matching products (${listStr}). Please specify the exact product.`
        }

        setMessages((prev) => [...prev, createMsg('assistant', reply, { data: inv })])
        speak(reply)
        setConversationState('idle')
      } else if (res.type === 'report') {
        const rep = res.data
        const reply = rep.message || `Today's net sales: ${rep.total_revenue_rupees} across ${rep.confirmed_sales_count} sale(s).`
        setMessages((prev) => [...prev, createMsg('assistant', reply, { data: rep })])
        speak(reply)
        setConversationState('idle')
      } else {
        setMessages((prev) => [...prev, createMsg('assistant', res.message || 'Request processed.')])
        setConversationState('idle')
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        createMsg('assistant', `⚠️ Request failed: ${err.message}`, { isError: true }),
      ])
      setConversationState('error')
    }
  }

  const quickScenarios = [
    // Workflow A: Inventory lookup
    {
      category: 'Inventory',
      label: '🍪 Biscuits left? (EN)',
      query: 'How many packets of biscuits are left?',
      desc: 'Check stock of biscuits in base units',
    },
    {
      category: 'Inventory',
      label: '🍪 બિસ્કિટ કેટલા બાકી છે? (GU)',
      query: 'બિસ્કિટના કેટલા પેકેટ બાકી છે?',
      desc: 'Gujarati inventory query',
    },
    {
      category: 'Inventory',
      label: '🍪 बिस्कुट कितने बचे हैं? (HI)',
      query: 'बिस्कुट के कितने पैकेट बचे हैं?',
      desc: 'Hindi inventory query',
    },
    // Workflow B: Sale proposal
    {
      category: 'Sale',
      label: '🍪 Sell 5 biscuits (EN)',
      query: 'Sell five packets of biscuits.',
      desc: 'Creates a draft sale proposal without mutating stock',
    },
    {
      category: 'Sale',
      label: '☕ ૫ પેકેટ બિસ્કિટ વેચવાના છે (GU)',
      query: '૫ પેકેટ બિસ્કિટ વેચવાના છે.',
      desc: 'Gujarati sale proposal with Indic numeral ૫',
    },
    {
      category: 'Sale',
      label: '🍪 पांच पैकेट बिस्कुट बेचने हैं (HI)',
      query: 'पांच पैकेट बिस्कुट बेचने हैं।',
      desc: 'Hindi sale proposal with word पांच',
    },
    // Workflow C: Purchase receipt
    {
      category: 'Purchase',
      label: '🧼 Received 2 boxes soap (EN)',
      query: 'We received two boxes of soap.',
      desc: 'Incoming wholesale stock receipt proposal',
    },
    // Workflow D: Daily report
    {
      category: 'Report',
      label: '📊 Today\'s sales (EN)',
      query: 'Show today\'s sales.',
      desc: 'Verified daily sales summary',
    },
    {
      category: 'Report',
      label: '📊 આજના વેચાણનો હિસાબ (GU)',
      query: 'આજના વેચાણનો હિસાબ બતાવો.',
      desc: 'Gujarati daily sales report',
    },
    {
      category: 'Report',
      label: '📊 आज की बिक्री बताओ (HI)',
      query: 'आज की बिक्री बताओ।',
      desc: 'Hindi daily sales report',
    },
  ]

  const getStateBadge = () => {
    switch (conversationState) {
      case 'processing':
        return <span className="badge badge-warning" data-testid="state-badge">⏳ Processing MCP...</span>
      case 'awaiting_confirmation':
        return <span className="badge badge-warning" data-testid="state-badge">⚠️ Awaiting Confirmation</span>
      case 'completed':
        return <span className="badge badge-success" data-testid="state-badge">✓ Last Action Confirmed</span>
      case 'cancelled':
        return <span className="badge badge-info" data-testid="state-badge">🛑 Action Cancelled</span>
      case 'error':
        return <span className="badge badge-danger" data-testid="state-badge">⚠️ Error State</span>
      default:
        return <span className="badge badge-info" data-testid="state-badge">● Ready</span>
    }
  }

  return (
    <div className="alexa-plus-simulator" data-testid="alexa-plus-simulator">
      {/* Header Banner & Disclaimer */}
      <section className="alexa-plus-banner card" aria-label="Alexa+ Information">
        <div className="alexa-plus-banner-top">
          <div className="alexa-plus-title-group">
            <span style={{ fontSize: '1.6rem' }} role="img" aria-label="Microphone">🎙️</span>
            <div>
              <h2 className="alexa-plus-title">DukaanVoice: Alexa+ Simulated Experience</h2>
              <p className="alexa-plus-subtitle">
                Natural Language Shop Register over Model Context Protocol (MCP 2025-11-25)
              </p>
            </div>
          </div>
          <div className="alexa-plus-badges">
            <span className={`badge ${mcpStatus.connected ? 'badge-success' : 'badge-danger'}`} data-testid="mcp-status-badge">
              {mcpStatus.connected ? '● MCP Online' : '○ MCP Offline'}
            </span>
            {getStateBadge()}
            {mcpStatus.sessionId && (
              <span className="badge badge-info" style={{ fontFamily: 'monospace', fontSize: '0.72rem' }} title={`Session: ${mcpStatus.sessionId}`}>
                Session: {mcpStatus.sessionId.slice(0, 8)}...
              </span>
            )}
          </div>
        </div>
        <div className="alexa-plus-disclaimer">
          <strong>Prototype Simulation:</strong> This interface demonstrates hands-free Kirana store management via official Model Context Protocol (MCP) Streamable HTTP tools. It is an independent simulation for the Amazon Developer Hackathon 2026 and does not require or claim official Amazon hardware endorsement.
        </div>

        {/* Voice Delivery Controls & Status */}
        <div className="alexa-plus-voice-bar" aria-label="Voice Controls">
          <div className="alexa-plus-voice-info">
            <span
              className={`badge ${voiceState.pollyAvailable ? 'badge-success' : 'badge-info'}`}
              data-testid="voice-provider-badge"
              title={voiceState.pollyAvailable ? 'Amazon Polly Neural Active' : 'Browser SpeechSynthesis Fallback'}
            >
              🎙️ {voiceState.provider}
            </span>

            {!voiceState.pollyAvailable && voiceState.availableVoices && voiceState.availableVoices.length > 0 && (
              <select
                className="alexa-plus-voice-select"
                value={voiceState.selectedVoiceURI || ''}
                onChange={(e) => voiceService.setSelectedVoiceURI(e.target.value)}
                data-testid="voice-select-dropdown"
                title="Select installed assistant voice"
                aria-label="Select voice"
              >
                <option value="">Auto (Best Ranked Natural Voice)</option>
                {voiceState.availableVoices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name.replace(/Microsoft |Google /g, '').slice(0, 26)} ({v.lang})
                  </option>
                ))}
              </select>
            )}

            {voiceState.isSpeaking && (
              <span className="badge badge-warning pulse" data-testid="voice-speaking-indicator">
                🔊 Speaking...
              </span>
            )}
          </div>

          <div className="alexa-plus-voice-actions">
            <div className="alexa-plus-voice-speed" aria-label="Speech Rate">
              <span>Speed:</span>
              {[0.9, 1.05, 1.2].map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`alexa-plus-speed-btn ${voiceState.rate === r ? 'active' : ''}`}
                  onClick={() => voiceService.setRate(r)}
                  data-testid={`voice-speed-${r}`}
                  title={r === 1.05 ? 'Amazon Alexa Default Pace (1.05x)' : `${r}x pace`}
                >
                  {r === 1.05 ? '1.05x (Alexa)' : `${r}x`}
                </button>
              ))}
            </div>

            <button
              type="button"
              className={`btn btn-sm ${voiceState.previewState === 'loading' ? 'btn-secondary' : voiceState.previewState === 'error' ? 'btn-danger' : 'btn-outline'}`}
              onClick={() => voiceService.preview(locale)}
              disabled={voiceState.previewState === 'loading'}
              data-testid="voice-preview-btn"
              title="Audition voice delivery"
            >
              {voiceState.previewState === 'loading'
                ? '⏳ Loading...'
                : voiceState.previewState === 'playing'
                ? '🔊 Playing...'
                : voiceState.previewState === 'error'
                ? '⚠️ Retry'
                : '▶ Audition Voice'}
            </button>

            {voiceState.isSpeaking && (
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                onClick={() => voiceService.cancel()}
                data-testid="voice-stop-btn"
                title="Stop current speech"
              >
                ⏹️ Stop
              </button>
            )}

            <button
              type="button"
              className={`btn btn-sm ${voiceState.muted ? 'btn-danger' : 'btn-outline'}`}
              onClick={() => voiceService.setMuted(!voiceState.muted)}
              data-testid="voice-mute-btn"
              title={voiceState.muted ? 'Unmute voice feedback' : 'Mute voice feedback'}
            >
              {voiceState.muted ? '🔇 Muted' : '🔊 Voice On'}
            </button>
          </div>
        </div>
      </section>

      {/* Suggested Demo Scenarios */}
      <section className="alexa-plus-scenarios-card card" aria-label="Suggested Demo Scenarios">
        <div className="alexa-plus-scenarios-title">
          <span>⚡ Suggested Multilingual Demo Scenarios:</span>
        </div>
        <div className="alexa-plus-scenarios-grid">
          {quickScenarios.map((scen, idx) => (
            <button
              key={idx}
              type="button"
              className="alexa-plus-scenario-btn"
              onClick={() => handleSend(scen.query)}
              disabled={isProcessing}
              title={scen.desc}
              data-testid={`scenario-btn-${idx}`}
            >
              {scen.label}
            </button>
          ))}
        </div>
      </section>

      {/* Conversation Panel */}
      <section className="alexa-plus-chat-card" aria-label="Conversation Panel">
        <div className="alexa-plus-chat-stream" role="log" aria-live="polite">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`alexa-plus-bubble ${msg.sender} ${msg.isError ? 'error' : ''} ${msg.isSuccess ? 'success' : ''}`}
              data-testid={`chat-bubble-${msg.sender}`}
            >
              <div className="alexa-plus-bubble-meta">
                {msg.sender === 'user' ? 'Shopkeeper' : 'DukaanVoice Assistant'} • {msg.timestamp}
              </div>
              <div className="alexa-plus-bubble-content">
                {msg.text}
              </div>
            </div>
          ))}

          {/* Active Proposal Card with Confirmation & Cancellation Controls */}
          {activeProposal && (
            <div className="alexa-plus-proposal-card" data-testid="proposal-card">
              <div className="alexa-plus-proposal-header">
                <span className="badge badge-warning">
                  ⏳ Action Proposal Awaiting Confirmation
                </span>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                  Draft #{activeProposal.draftId}
                </span>
              </div>

              <div className="alexa-plus-proposal-title">
                {activeProposal.type === 'sale_proposal' ? '📦 Confirm Store Sale' : '📥 Confirm Incoming Purchase'}
              </div>

              <div className="alexa-plus-proposal-grid">
                <div className="alexa-plus-proposal-cell">
                  <div className="alexa-plus-proposal-cell-label">Product</div>
                  <div className="alexa-plus-proposal-cell-value" data-testid="proposal-product-name">{activeProposal.productName}</div>
                </div>
                <div className="alexa-plus-proposal-cell">
                  <div className="alexa-plus-proposal-cell-label">Quantity</div>
                  <div className="alexa-plus-proposal-cell-value" data-testid="proposal-quantity">{activeProposal.quantity} {activeProposal.unit}</div>
                </div>
                <div className="alexa-plus-proposal-cell">
                  <div className="alexa-plus-proposal-cell-label">Total Amount</div>
                  <div className="alexa-plus-proposal-cell-value" style={{ color: 'var(--color-primary-light)' }} data-testid="proposal-amount">
                    {activeProposal.totalFormatted}
                  </div>
                </div>
                <div className="alexa-plus-proposal-cell">
                  <div className="alexa-plus-proposal-cell-label">Stock Impact</div>
                  <div className="alexa-plus-proposal-cell-value" data-testid="proposal-stock-impact">
                    {activeProposal.currentStock} → <span style={{ color: activeProposal.type === 'sale_proposal' ? 'var(--color-danger)' : 'var(--color-success)', fontWeight: 700 }}>
                      {activeProposal.proposedStock} {activeProposal.baseUnit}
                    </span>
                  </div>
                </div>
              </div>

              <div className="alexa-plus-proposal-actions">
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={handleConfirmProposal}
                  disabled={isProcessing}
                  style={{ flex: 1, padding: '10px 16px', fontWeight: 600 }}
                  data-testid="confirm-proposal-btn"
                  aria-label="Confirm proposal and update stock"
                >
                  {isProcessing ? 'Committing to Ledger...' : '✓ Confirm & Update Stock'}
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleCancelProposal}
                  disabled={isProcessing}
                  style={{ padding: '10px 18px' }}
                  data-testid="cancel-proposal-btn"
                  aria-label="Cancel proposal"
                >
                  ✕ Cancel
                </button>
              </div>
            </div>
          )}

          {isProcessing && (
            <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.85rem' }} data-testid="loading-indicator">
              <div className="spinner" style={{ width: '16px', height: '16px' }} />
              Executing authoritative retail tool via Model Context Protocol...
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Accessible Input Bar */}
        <form
          className="alexa-plus-input-bar"
          onSubmit={(e) => {
            e.preventDefault()
            handleSend()
          }}
          aria-label="Assistant input form"
        >
          <button
            type="button"
            className={`btn ${isListening ? 'btn-danger' : 'btn-outline'}`}
            onClick={toggleMic}
            title={isListening ? 'Stop listening' : 'Speak in Gujarati, Hindi, or English'}
            aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
            style={{ padding: '0 12px', minWidth: '44px', minHeight: '42px' }}
            disabled={isProcessing}
          >
            {isListening ? '⏹️' : '🎙️'}
          </button>
          <input
            ref={inputRef}
            type="text"
            className="alexa-plus-input-field"
            placeholder="Type or speak (e.g. 'Sell 5 packets of biscuits', 'બિસ્કિટના કેટલા પેકેટ બાકી છે?')..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isProcessing}
            data-testid="chat-input"
            aria-label="Query input for Alexa+ simulator"
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isProcessing || !input.trim()}
            style={{ minWidth: '80px', minHeight: '42px' }}
            data-testid="chat-send-btn"
            aria-label="Send query"
          >
            Send
          </button>
        </form>
      </section>
    </div>
  )
}
