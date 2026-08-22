import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth/AuthProvider';
import { AppErrorBoundary } from './components/ui/AppErrorBoundary';
import { initializeObservability } from './observability';
import './styles.css';

void initializeObservability();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <AuthProvider>
        <HashRouter>
          <App />
        </HashRouter>
      </AuthProvider>
    </AppErrorBoundary>
  </React.StrictMode>,
);
