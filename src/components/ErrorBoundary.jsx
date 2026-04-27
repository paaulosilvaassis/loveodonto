import { Component } from 'react';
import { emitStabilityLog } from '../services/stabilityLogService.js';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    emitStabilityLog('ROUTE_ERROR', {
      message: String(error?.message || error || ''),
      route: window.location.pathname,
      componentStack: String(info?.componentStack || ''),
    });
    if (import.meta?.env?.DEV) {
      // eslint-disable-next-line no-console
      console.error('Erro de UI capturado:', error, info);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReloadPage = () => {
    window.location.reload();
  };

  render() {
    const { hasError, error } = this.state;
    if (!hasError) return this.props.children;
    return (
      <div style={{ padding: '2rem', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <h2>Ops, algo deu errado</h2>
        <p>O app encontrou um erro inesperado.</p>
        <p className="muted">Sua sessão foi preservada. Você pode tentar novamente sem fazer logout.</p>
        {error?.message ? <p style={{ color: '#991b1b' }}>{error.message}</p> : null}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
          <button type="button" onClick={this.handleRetry} style={{ padding: '0.6rem 1rem', cursor: 'pointer' }}>
            Tentar novamente
          </button>
          <button type="button" onClick={this.handleReloadPage} style={{ padding: '0.6rem 1rem', cursor: 'pointer', opacity: 0.7 }}>
            Recarregar página
          </button>
        </div>
      </div>
    );
  }
}
