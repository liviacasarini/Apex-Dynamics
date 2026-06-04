import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import LicenseGate from './license/LicenseGate';
import { ThemeProvider } from './context/ThemeContext';
import './styles/global.css';

// Em produção (build), silencia console.log/info/debug para não poluir nem
// expor detalhes internos. Mantém warn/error para diagnóstico de problemas.
if (import.meta.env.PROD) {
  const noop = () => {};
  console.log = noop;
  console.info = noop;
  console.debug = noop;
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, color: '#ff6b6b', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
          <h2>Erro na aplicação</h2>
          <p>{this.state.error.message}</p>
          <pre>{this.state.error.stack}</pre>
          <button onClick={() => this.setState({ error: null })} style={{ marginTop: 16, padding: '8px 16px', cursor: 'pointer' }}>
            Tentar novamente
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <LicenseGate>
          <App />
        </LicenseGate>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
