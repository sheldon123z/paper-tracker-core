/**
 * ErrorBoundary for React.lazy() loaded tool card renderers.
 *
 * When a dynamic chunk fails to load (CDN fault, network error, etc.) the
 * thrown error would otherwise propagate up and crash the entire chat area.
 * This boundary catches the error and renders a minimal fallback card instead.
 */
import { Component } from 'react'

const defaultFallback = (error) => (
  <div style={{
    padding: '10px 14px',
    borderRadius: 8,
    background: 'var(--bg-secondary, #f5f5f5)',
    border: '1px solid var(--border, #e0e0e0)',
    color: 'var(--text-secondary, #888)',
    fontSize: 13,
  }}>
    组件加载失败{error?.message ? `: ${error.message}` : ''}
  </div>
)

export default class ErrorBoundary extends Component {
  state = { hasError: false, error: null }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.warn('[ErrorBoundary] lazy load failed:', error, info)
  }

  render() {
    if (this.state.hasError) {
      const { fallback } = this.props
      if (typeof fallback === 'function') {
        return fallback(this.state.error)
      }
      if (fallback !== undefined) {
        return fallback
      }
      return defaultFallback(this.state.error)
    }
    return this.props.children
  }
}
