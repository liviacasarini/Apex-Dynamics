import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import LicenseGate from './license/LicenseGate';
import { ThemeProvider } from './context/ThemeContext';
import './styles/global.css';

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
