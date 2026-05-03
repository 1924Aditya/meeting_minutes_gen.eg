import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[SAMVAAD ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          position: 'fixed', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'hsl(225,20%,6%)',
          color: 'hsl(220,15%,85%)',
          fontFamily: 'Inter, sans-serif',
          gap: 16, padding: 32
        }}>
          <div style={{ fontSize: 40 }}>⚠️</div>
          <h2 style={{ fontWeight: 700, fontSize: 18 }}>Something went wrong</h2>
          <p style={{ color: 'hsl(220,10%,55%)', fontSize: 13, maxWidth: 400, textAlign: 'center' }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload() }}
            style={{
              marginTop: 8, padding: '10px 24px',
              background: 'linear-gradient(135deg, hsl(220,90%,55%), hsl(260,80%,65%))',
              color: 'white', border: 'none', borderRadius: 10,
              fontWeight: 600, cursor: 'pointer', fontSize: 13
            }}
          >
            Reload App
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
