/**
 * DukaanVoice Voice Service Test Suite
 * Verifies:
 * 1. Text normalization for Alexa-style natural delivery (stripping markdown, emoji, formatting currency)
 * 2. Intelligent browser voice ranking (neural/natural priority, language matching)
 * 3. Mute, rate, and volume state management and bounds clamping
 * 4. Concurrency and cancellation management
 * 5. Accurate and honest provider labeling (Polly vs Browser vs Muted)
 * 6. Subscription listener notifications
 * 7. Backend Polly status check integration
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { voiceService } from './services/voiceService.js'

describe('VoiceService: Natural Alexa-Style Delivery & Audio Controls', () => {

  beforeEach(() => {
    voiceService.cancel()
    voiceService.muted = false
    voiceService.rate = 1.05
    voiceService.volume = 1.0
    voiceService.pollyStatus = { available: false, provider: 'browser_speech_synthesis', checked: false }
    voiceService.voices = []
    voiceService.selectedVoiceURI = null
  })

  it('1. Normalizes markdown, bold, emojis, and urls for speech synthesis', () => {
    const raw = '**ALERT:** Found 5 items with `low stock`! 📦 Visit https://example.com for details.'
    const normalized = voiceService.normalizeTextForSpeech(raw)
    assert.ok(!normalized.includes('**'))
    assert.ok(!normalized.includes('`'))
    assert.ok(!normalized.includes('📦'))
    assert.ok(!normalized.includes('https://'))
    assert.ok(normalized.includes('ALERT:'))
    assert.ok(normalized.includes('Found 5 items with low stock!'))
  })

  it('2. Formats Indian Rupee currency symbols into spoken words', () => {
    const raw = 'The total bill comes to ₹1,250.50 including GST.'
    const normalized = voiceService.normalizeTextForSpeech(raw)
    assert.ok(!normalized.includes('₹'))
    assert.ok(normalized.includes('1,250.50 rupees'))
  })

  it('3. Cleans bullet lists and headings into conversational phrasing', () => {
    const raw = '### Stock Summary\n* 10 packets Parle-G\n* 5 kg Sugar\n---\nThank you!'
    const normalized = voiceService.normalizeTextForSpeech(raw)
    assert.ok(!normalized.includes('###'))
    assert.ok(!normalized.includes('*'))
    assert.ok(!normalized.includes('---'))
    assert.ok(normalized.includes('Stock Summary'))
    assert.ok(normalized.includes('10 packets Parle G 5 kilograms Sugar Thank you!'))
  })

  it('4. Selects highest-ranked natural/neural voice matching the requested locale', () => {
    voiceService.voices = [
      { name: 'Generic Desktop Voice', lang: 'en-US' },
      { name: 'Microsoft Heera - Hindi (India)', lang: 'hi-IN' },
      { name: 'Google हिन्दी Neural', lang: 'hi-IN' },
      { name: 'Microsoft Neerja Online (Natural) - English (India)', lang: 'en-IN' },
      { name: 'Standard Gujarati Voice', lang: 'gu-IN' },
    ]

    const englishVoice = voiceService.getBestBrowserVoice('en')
    assert.ok(englishVoice)
    assert.equal(englishVoice.name, 'Microsoft Neerja Online (Natural) - English (India)')

    const hindiVoice = voiceService.getBestBrowserVoice('hi')
    assert.ok(hindiVoice)
    assert.equal(hindiVoice.name, 'Google हिन्दी Neural')

    const gujaratiVoice = voiceService.getBestBrowserVoice('gu')
    assert.ok(gujaratiVoice)
    assert.equal(gujaratiVoice.name, 'Standard Gujarati Voice')
  })

  it('5. Falls back safely when no voices match the exact locale', () => {
    voiceService.voices = [
      { name: 'English United States', lang: 'en-US' },
    ]
    const strictVoice = voiceService.getBestBrowserVoice('gu', false)
    assert.equal(strictVoice, null)

    const fallbackVoice = voiceService.getBestBrowserVoice('gu', true)
    assert.equal(fallbackVoice.name, 'English United States')
  })

  it('6. Accurately reports active voice provider without false claims', () => {
    // Case A: Muted
    voiceService.setMuted(true)
    assert.equal(voiceService.getActiveProviderLabel('en'), 'Voice Muted')

    // Case B: Unmuted, Polly available
    voiceService.setMuted(false)
    voiceService.pollyStatus = { available: true, provider: 'amazon_polly_neural', checked: true }
    assert.equal(voiceService.getActiveProviderLabel('en'), 'Amazon Polly Neural (AWS)')

    // Case C: Unmuted, Polly unavailable, natural browser voice
    voiceService.pollyStatus = { available: false, provider: 'browser_speech_synthesis', checked: true }
    voiceService.voices = [{ name: 'Microsoft Neerja (Natural)', lang: 'en-IN' }]
    assert.ok(voiceService.getActiveProviderLabel('en').includes('(Natural)'))

    // Case D: Unmuted, standard browser voice
    voiceService.voices = [{ name: 'Standard Voice', lang: 'en-IN' }]
    assert.ok(voiceService.getActiveProviderLabel('en').includes('(Browser)'))

    // Case E: No voices loaded
    voiceService.voices = []
    assert.equal(voiceService.getActiveProviderLabel('en'), 'Browser Speech (Default)')
  })

  it('7. Speech rate limits to safe conversational bounds', () => {
    voiceService.setRate(1.2)
    assert.equal(voiceService.rate, 1.2)

    voiceService.setRate(1.05) // Alexa default
    assert.equal(voiceService.rate, 1.05)

    // Out of bounds: should be ignored
    voiceService.setRate(2.5)
    assert.equal(voiceService.rate, 1.05)

    voiceService.setRate(0.3)
    assert.equal(voiceService.rate, 1.05)
  })

  it('8. Volume limits between 0.0 and 1.0', () => {
    voiceService.setVolume(0.8)
    assert.equal(voiceService.volume, 0.8)

    voiceService.setVolume(1.5) // Out of bounds
    assert.equal(voiceService.volume, 0.8)

    voiceService.setVolume(-0.2) // Out of bounds
    assert.equal(voiceService.volume, 0.8)
  })

  it('9. Subscribers are notified of state changes', () => {
    let callCount = 0
    const unsubscribe = voiceService.subscribe((vs) => {
      callCount++
      assert.equal(vs.muted, true)
    })

    voiceService.setMuted(true)
    assert.equal(callCount, 1)

    unsubscribe()
    voiceService.setMuted(false)
    assert.equal(callCount, 1) // Did not fire after unsubscribe
  })

  it('10. Cancel immediately resets speaking state', () => {
    voiceService.isSpeaking = true
    voiceService.cancel()
    assert.equal(voiceService.isSpeaking, false)
  })

  it('11. checkBackendPollyStatus updates pollyStatus state from API', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (url) => {
      if (url === '/api/tts/status') {
        return {
          ok: true,
          json: async () => ({
            available: true,
            provider: 'amazon_polly_neural',
            region: 'ap-south-1',
          }),
        }
      }
      return { ok: false }
    }

    try {
      const status = await voiceService.checkBackendPollyStatus()
      assert.equal(status.available, true)
      assert.equal(voiceService.pollyStatus.available, true)
      assert.equal(voiceService.pollyStatus.provider, 'amazon_polly_neural')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('12. checkBackendPollyStatus handles API failure gracefully without crashing', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => {
      throw new Error('Connection refused')
    }

    try {
      const status = await voiceService.checkBackendPollyStatus()
      assert.equal(status.available, false)
      assert.equal(voiceService.pollyStatus.available, false)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('13. Heavily penalizes mechanical legacy voices and prioritizes natural female assistant voices', () => {
    voiceService.voices = [
      { name: 'Microsoft David - English (United States)', lang: 'en-US', voiceURI: 'david' },
      { name: 'Microsoft Mark - English (United States)', lang: 'en-US', voiceURI: 'mark' },
      { name: 'Microsoft Heera - English (India)', lang: 'en-IN', voiceURI: 'heera' },
      { name: 'Microsoft Zira - English (United States)', lang: 'en-US', voiceURI: 'zira' },
    ]

    const bestEn = voiceService.getBestBrowserVoice('en')
    assert.equal(bestEn.voiceURI, 'heera') // Heera wins for en-IN retail

    // If user explicitly chooses Zira (the US assistant voice from pik1989/Alexa)
    voiceService.setSelectedVoiceURI('zira')
    const chosen = voiceService.getBestBrowserVoice('en')
    assert.equal(chosen.voiceURI, 'zira')
  })

  it('14. Strips internal database barcode digits and expands retail units in speech normalization', () => {
    const raw = 'Found product Parle-G Gold 1792165528910: 45 pkts in stock.'
    const clean = voiceService.normalizeTextForSpeech(raw)
    assert.ok(!clean.includes('1792165528910'))
    assert.ok(clean.includes('Parle G Gold'))
    assert.ok(clean.includes('45 packets in stock'))
  })
})
