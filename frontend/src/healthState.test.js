import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { healthIndicatorState } from './healthState.js'

describe('healthIndicatorState', () => {
  it('returns a loading state', () => {
    const state = healthIndicatorState({ loading: true, error: null, data: null })
    assert.equal(state.status, 'loading')
    assert.equal(state.tone, 'warning')
  })

  it('returns success when GET /api/health reports ok', () => {
    const state = healthIndicatorState({
      loading: false,
      error: null,
      data: { status: 'ok', service: 'DukaanVoice AI', version: '0.1.0' },
    })
    assert.equal(state.status, 'success')
    assert.equal(state.tone, 'success')
    assert.match(state.detail, /DukaanVoice AI/)
  })

  it('returns error when the request fails', () => {
    const state = healthIndicatorState({
      loading: false,
      error: 'Failed to fetch',
      data: null,
    })
    assert.equal(state.status, 'error')
    assert.equal(state.tone, 'danger')
  })

  it('returns error when the payload is not healthy', () => {
    const state = healthIndicatorState({
      loading: false,
      error: null,
      data: { status: 'down' },
    })
    assert.equal(state.status, 'error')
  })
})
