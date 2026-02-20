import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ErrorBoundary.jsx:componentDidCatch',message:'ErrorBoundary caught error',data:{message:error?.message,componentStack:info?.componentStack?.slice(0,200)},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
    // #endregion
    if (import.meta?.env?.DEV) {
      // eslint-disable-next-line no-console
      console.error('Erro de UI capturado:', error, info);
    }
  }

  handleReset = () => {
    try {
      localStorage.removeItem('appgestaoodonto.db');
      localStorage.removeItem('appgestaoodonto.session');
    } catch {
      // ignore
    }
    window.location.reload();
  };

  render() {
    const { hasError, error } = this.state;
    if (!hasError) return this.props.children;
    return (
      <div style={{ padding: '2rem', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <h2>Ops, algo deu errado</h2>
        <p>O app encontrou um erro inesperado. Você pode recarregar e resetar os dados locais.</p>
        {error?.message ? <p style={{ color: '#991b1b' }}>{error.message}</p> : null}
        <button type="button" onClick={this.handleReset} style={{ padding: '0.6rem 1rem', cursor: 'pointer' }}>
          Recarregar e resetar
        </button>
      </div>
    );
  }
}
