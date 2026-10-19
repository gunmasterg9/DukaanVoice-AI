/**
 * DukaanVoice Voice Service
 * Polished Conversational Voice Engine supporting:
 * 1. Configurable Amazon Polly Neural TTS (via backend /api/tts/synthesize)
 * 2. Natural Browser SpeechSynthesis fallback with smart voice ranking & selection
 * 3. Dynamic locale adaptation (English, Hindi, Gujarati)
 * 4. Alexa-style conversational delivery with clean prosody and text normalization
 * 5. Concurrency prevention, speech cancellation, volume/rate controls, and audio toggle
 * 6. Detailed audio preview with loading, playing, and error states
 */

class VoiceService {
  constructor() {
    this.audioElement = null
    this.pollyStatus = { available: false, provider: 'browser_speech_synthesis', checked: false }
    this.voices = []
    this.selectedVoiceURI = null
    this.rate = 1.05 // Brisk, confident conversational rate (Alexa style)
    this.pitch = 1.02 // Warm, natural assistant pitch
    this.volume = 1.0
    this.muted = false
    this.isSpeaking = false
    this.previewState = 'idle' // 'idle' | 'loading' | 'playing' | 'error'
    this.listeners = new Set()

    if (typeof window !== 'undefined') {
      const storedMute = localStorage.getItem('dukaanvoice_audio_muted')
      if (storedMute !== null) {
        this.muted = storedMute === 'true'
      }

      const storedRate = localStorage.getItem('dukaanvoice_audio_rate')
      if (storedRate) {
        const parsed = parseFloat(storedRate)
        if (!isNaN(parsed) && parsed >= 0.7 && parsed <= 1.5) {
          this.rate = parsed
        }
      }

      const storedVoiceURI = localStorage.getItem('dukaanvoice_audio_voice_uri')
      if (storedVoiceURI) {
        this.selectedVoiceURI = storedVoiceURI
      }

      // Initialize browser voices and listen for async voiceschanged
      this._initBrowserVoices()
    }
  }

  _initBrowserVoices() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return

    const load = () => {
      this.voices = window.speechSynthesis.getVoices() || []
      this._notify()
    }

    load()
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = load
    }
  }

  /**
   * Check backend Polly status securely without exposing credentials
   */
  async checkBackendPollyStatus() {
    if (typeof fetch === 'undefined') return this.pollyStatus

    try {
      const res = await fetch('/api/tts/status')
      if (res.ok) {
        const data = await res.json()
        this.pollyStatus = {
          available: Boolean(data.available),
          provider: data.provider || 'browser_speech_synthesis',
          engine: data.engine || 'browser',
          region: data.region,
          checked: true,
          message: data.message,
        }
      } else {
        this.pollyStatus = { available: false, provider: 'browser_speech_synthesis', checked: true }
      }
    } catch {
      this.pollyStatus = { available: false, provider: 'browser_speech_synthesis', checked: true }
    }
    this._notify()
    return this.pollyStatus
  }

  /**
   * Clean text for Alexa-style natural voice delivery:
   * Strips markdown bold/italic, emojis, code blocks, URLs, and bullet points
   * Expands retail units, clarifies currency amounts, and strips database barcode IDs
   */
  normalizeTextForSpeech(rawText) {
    if (!rawText) return ''
    return rawText
      // Remove code blocks and inline code
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`([^`]+)`/g, '$1')
      // Remove URLs
      .replace(/https?:\/\/\S+/g, '')
      // Remove horizontal dividers (--- or ===)
      .replace(/^[=-]{3,}\s*$/gm, '')
      .replace(/--+/g, '')
      // Remove markdown bold, italic, headers
      .replace(/[*_#~]/g, '')
      // Remove leading bullet symbols
      .replace(/^[•\-*]\s+/gm, '')
      // Remove common status and UI emojis and variation selectors
      .replace(/\uFE0F/gu, '')
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}✓✕●○•▶✔ℹ]/gu, '')
      // Strip internal database timestamp IDs and barcodes (e.g. 1792165528910)
      .replace(/\b\d{8,}\b/g, '')
      // Clarify Indian retail brand names so TTS doesn't say "hyphen"
      .replace(/\bParle-G\b/gi, 'Parle G')
      // Currency pronunciation: format rupee amounts cleanly
      .replace(/₹\s*([\d,]+)\.00\b/g, '$1 rupees')
      .replace(/₹\s*([\d,]+(?:\.\d+)?)/g, '$1 rupees')
      // Retail unit expansion for natural prosody
      .replace(/\b(\d+(?:\.\d+)?)\s*pkts?\b/gi, '$1 packets')
      .replace(/\b(\d+(?:\.\d+)?)\s*kgs?\b/gi, '$1 kilograms')
      .replace(/\b(\d+(?:\.\d+)?)\s*ltrs?\b/gi, '$1 litres')
      .replace(/\b(\d+(?:\.\d+)?)\s*pcs?\b/gi, '$1 pieces')
      .replace(/\b(\d+(?:\.\d+)?)\s*gms?\b/gi, '$1 grams')
      // Convert list colons into natural breathing pauses (except after uppercase label tags like ALERT:)
      .replace(/(?<![A-Z]{2,}):\s+/g, ', ')
      // Remove brackets and parentheses
      .replace(/[()[\]{}]/g, '')
      // Collapse whitespace
      .replace(/\s+/g, ' ')
      .trim()
  }

  /**
   * Score an installed browser voice based on naturalness, locale alignment, and assistant style
   */
  scoreVoice(v, locale = 'en') {
    const name = (v.name || '').toLowerCase()
    const lang = (v.lang || '').toLowerCase()
    let score = 0

    // 1. Language matching: exact language matches are mandatory for intelligible pronunciation
    if (locale === 'gu') {
      if (lang.startsWith('gu')) score += 400
      else if (lang.startsWith('hi')) score += 100
      else if (lang.startsWith('en-in')) score += 30
      else if (lang.startsWith('en')) score += 10
    } else if (locale === 'hi') {
      if (lang.startsWith('hi')) score += 400
      else if (lang.startsWith('gu')) score += 80
      else if (lang.startsWith('en-in')) score += 40
      else if (lang.startsWith('en')) score += 20
    } else {
      // English: prioritize Indian English (en-IN) for Kirana store context
      if (lang.startsWith('en-in')) score += 400
      else if (lang.startsWith('en')) score += 300
      else if (lang.startsWith('hi')) score += 50
    }

    // 2. High-fidelity Neural / Natural indicators
    if (name.includes('online (natural)') || name.includes('natural') || name.includes('neural')) {
      score += 120
    }

    // 3. Conversational / Assistant Female Voices (preferred over mechanical male voices)
    const femaleAssistantNames = ['heera', 'zira', 'samantha', 'neerja', 'swara', 'aditi', 'kajal', 'priya', 'kalpana', 'veena', 'siri', 'cortana', 'kavya', 'ananya']
    if (femaleAssistantNames.some((fn) => name.includes(fn))) {
      score += 60
    }

    // 4. Quality Brand weight
    if (name.includes('google')) score += 35
    if (name.includes('apple')) score += 30
    if (name.includes('microsoft')) score += 15

    // 5. Heavy penalty for notorious robotic/legacy voices (David, Mark, Desktop SAPI5)
    if (name.includes('david')) score -= 80
    if (name.includes('mark')) score -= 40
    if (name.includes('desktop')) score -= 40
    if (name.includes('hazel')) score -= 20
    if (name.includes('george')) score -= 20

    return score
  }

  /**
   * Dynamically select best available browser voice matching locale
   * Prefers Natural/Neural and Indian assistant voices, avoiding mechanical legacy voices
   */
  getBestBrowserVoice(locale = 'en', allowFallback = true) {
    if (!this.voices || this.voices.length === 0) {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        this.voices = window.speechSynthesis.getVoices() || []
      }
    }

    if (!this.voices || this.voices.length === 0) return null

    // 1. If user explicitly selected a voice, prioritize that selection
    if (this.selectedVoiceURI) {
      const userChoice = this.voices.find((v) => v.voiceURI === this.selectedVoiceURI)
      if (userChoice) return userChoice
    }

    // 2. Score all available voices
    const scored = this.voices.map((v) => ({
      voice: v,
      score: this.scoreVoice(v, locale),
    }))

    // Sort descending by score
    scored.sort((a, b) => b.score - a.score)

    if (scored.length > 0) {
      if (allowFallback) {
        return scored[0].voice
      }
      // Strict matching: voice must match requested language code
      const langPrefix = locale.toLowerCase()
      if ((scored[0].voice.lang || '').toLowerCase().startsWith(langPrefix)) {
        return scored[0].voice
      }
      return null
    }

    return null
  }

  /**
   * Get sorted list of available browser voices for the user selection dropdown
   */
  getAvailableBrowserVoices(locale = 'en') {
    if (!this.voices || this.voices.length === 0) {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        this.voices = window.speechSynthesis.getVoices() || []
      }
    }
    return [...this.voices].sort((a, b) => this.scoreVoice(b, locale) - this.scoreVoice(a, locale))
  }

  /**
   * Explicitly set preferred browser voice URI with persistence
   */
  setSelectedVoiceURI(uri) {
    this.selectedVoiceURI = uri || null
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      if (this.selectedVoiceURI) {
        localStorage.setItem('dukaanvoice_audio_voice_uri', this.selectedVoiceURI)
      } else {
        localStorage.removeItem('dukaanvoice_audio_voice_uri')
      }
    }
    this._notify()
  }

  /**
   * Stop any current speech playback immediately
   */
  cancel(notify = true) {
    if (this.audioElement) {
      this.audioElement.pause()
      this.audioElement.currentTime = 0
      this.audioElement = null
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    this.isSpeaking = false
    this.previewState = 'idle'
    if (notify) this._notify()
  }

  /**
   * Speak text naturally using Amazon Polly Neural (if active) or Browser SpeechSynthesis fallback
   */
  async speak(text, locale = 'en') {
    if (this.muted) return
    const clean = this.normalizeTextForSpeech(text)
    if (!clean) return

    // Ensure backend TTS status has been queried before deciding speech path
    if (!this.pollyStatus.checked) {
      await this.checkBackendPollyStatus()
    }

    // Prevent overlapping speech: Cancel any in-flight playback
    this.cancel()

    // 1. If Amazon Polly is verified and available on backend, try Polly first
    if (this.pollyStatus.available) {
      try {
        const langCode = locale === 'hi' ? 'hi-IN' : locale === 'gu' ? 'gu-IN' : 'en-IN'
        const res = await fetch('/api/tts/synthesize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: clean,
            language_code: langCode,
            engine: 'neural',
          }),
        })

        if (res.ok) {
          const blob = await res.blob()
          const audioUrl = URL.createObjectURL(blob)
          const audio = new Audio(audioUrl)
          audio.volume = this.volume
          this.audioElement = audio

          audio.onplay = () => {
            this.isSpeaking = true
            this.previewState = 'playing'
            this._notify()
          }
          audio.onended = () => {
            this.isSpeaking = false
            this.previewState = 'idle'
            URL.revokeObjectURL(audioUrl)
            this.audioElement = null
            this._notify()
          }
          audio.onerror = () => {
            this.isSpeaking = false
            this.previewState = 'idle'
            URL.revokeObjectURL(audioUrl)
            this.audioElement = null
            this._notify()
            // Fall back to browser speech on playback error
            this._speakBrowser(clean, locale)
          }

          // Apply rate safely after loading
          audio.onloadedmetadata = () => {
            audio.playbackRate = this.rate
          }

          await audio.play()
          return
        }
      } catch {
        // Fall back to browser speech synthesis
      }
    }

    // 2. Browser SpeechSynthesis Fallback
    this._speakBrowser(clean, locale)
  }

  _speakBrowser(text, locale) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return

    try {
      const utterance = new SpeechSynthesisUtterance(text)
      const voice = this.getBestBrowserVoice(locale)

      if (voice) {
        utterance.voice = voice
        utterance.lang = voice.lang
      } else {
        utterance.lang = locale === 'gu' ? 'gu-IN' : locale === 'hi' ? 'hi-IN' : 'en-IN'
      }

      utterance.rate = this.rate
      utterance.pitch = this.pitch
      utterance.volume = this.volume

      utterance.onstart = () => {
        this.isSpeaking = true
        this.previewState = 'playing'
        this._notify()
      }
      utterance.onend = () => {
        this.isSpeaking = false
        this.previewState = 'idle'
        this._notify()
      }
      utterance.onerror = () => {
        this.isSpeaking = false
        this.previewState = 'idle'
        this._notify()
      }

      window.speechSynthesis.speak(utterance)
    } catch {
      this.isSpeaking = false
      this.previewState = 'idle'
      this._notify()
    }
  }

  /**
   * Play sample voice greeting with explicit loading, playing, and error feedback
   */
  async preview(locale = 'en') {
    this.previewState = 'loading'
    this._notify()

    const greeting =
      locale === 'gu'
        ? 'નમસ્તે! હું દુકાનવોઇસ સહાયક છું. હું સ્ટોક અને હિસાબમાં મદદ કરી શકું છું.'
        : locale === 'hi'
        ? 'नमस्ते! मैं दुकानवॉइस सहायक हूँ। मैं स्टॉक और हिसाब में आपकी मदद कर सकता हूँ।'
        : 'Namaste! I am DukaanVoice, your intelligent Kirana store assistant. All systems are ready.'

    try {
      await this.speak(greeting, locale)
    } catch {
      this.previewState = 'error'
      this._notify()
      setTimeout(() => {
        if (this.previewState === 'error') {
          this.previewState = 'idle'
          this._notify()
        }
      }, 3000)
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted)
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      localStorage.setItem('dukaanvoice_audio_muted', String(this.muted))
    }
    if (this.muted) {
      this.cancel(false)
    }
    this._notify()
  }

  setRate(rate) {
    const val = parseFloat(rate)
    if (!isNaN(val) && val >= 0.7 && val <= 1.4) {
      this.rate = val
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        localStorage.setItem('dukaanvoice_audio_rate', String(this.rate))
      }
      this._notify()
    }
  }

  setVolume(volume) {
    const val = parseFloat(volume)
    if (!isNaN(val) && val >= 0.0 && val <= 1.0) {
      this.volume = val
      this._notify()
    }
  }

  getActiveProviderLabel(locale = 'en') {
    if (this.muted) {
      return 'Voice Muted'
    }
    if (this.pollyStatus.available) {
      return 'Amazon Polly Neural (AWS)'
    }
    const voice = this.getBestBrowserVoice(locale)
    if (voice) {
      const isNatural = voice.name.toLowerCase().includes('natural') || voice.name.toLowerCase().includes('neural')
      return isNatural ? `${voice.name.slice(0, 24)} (Natural)` : `${voice.name.slice(0, 24)} (Browser)`
    }
    return 'Browser Speech (Default)'
  }

  subscribe(listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  _notify() {
    for (const listener of this.listeners) {
      try {
        listener(this)
      } catch {}
    }
  }
}

export const voiceService = new VoiceService()
