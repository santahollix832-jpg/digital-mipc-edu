import React from 'react';

/**
 * Global error boundary.
 *
 * Catches any runtime error thrown while rendering any part of the tree
 * (bad API data, a broken icon import, a QR encode failure, etc.) and shows
 * a readable recovery screen instead of a blank white page.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep the failure visible in the console for debugging.
    console.error('[ErrorBoundary] Rendering failed:', error, info?.componentStack);
  }

  handleReload = () => {
    this.setState({ error: null });
    window.location.assign(window.location.origin);
  };

  handleReset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    const { children } = this.props;

    if (!error) return children;

    return (
      <main
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f172a',
          color: '#e2e8f0',
          fontFamily: 'system-ui, sans-serif',
          padding: '24px',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 520 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 14, opacity: 0.8, marginBottom: 16 }}>
            The page hit an unexpected error. You can try again or reload the app.
          </p>
          <pre
            style={{
              maxHeight: 160,
              overflow: 'auto',
              background: 'rgba(255,255,255,0.06)',
              borderRadius: 10,
              padding: 12,
              fontSize: 12,
              textAlign: 'left',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {String(error?.message || error)}
          </pre>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 18 }}>
            <button
              type="button"
              onClick={this.handleReset}
              style={{
                padding: '10px 18px',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.25)',
                background: 'transparent',
                color: '#e2e8f0',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                padding: '10px 18px',
                borderRadius: 10,
                border: 'none',
                background: '#4f46e5',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Reload app
            </button>
          </div>
        </div>
      </main>
    );
  }
}

export default ErrorBoundary;
