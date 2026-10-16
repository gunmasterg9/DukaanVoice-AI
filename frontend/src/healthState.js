/**
 * Pure helper for API health indicator states.
 * Kept separate so Node can test it without a browser or Vite.
 */

export function healthIndicatorState({ loading, error, data }) {
  if (loading) {
    return {
      status: 'loading',
      label: 'Checking API…',
      detail: 'Waiting for GET /api/health',
      tone: 'warning',
    }
  }

  if (error || !data || data.status !== 'ok') {
    return {
      status: 'error',
      label: 'API unavailable',
      detail: error || 'The health endpoint did not report a successful status.',
      tone: 'danger',
    }
  }

  return {
    status: 'success',
    label: 'API running',
    detail: `${data.service || 'DukaanVoice AI'} ${data.version || ''}`.trim(),
    tone: 'success',
  }
}
