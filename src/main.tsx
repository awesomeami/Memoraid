import React, { Component, ErrorInfo, ReactNode, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false
  };

  public static getDerivedStateFromError(_: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error in ErrorBoundary:", error, errorInfo);
  }

  private handleReset = () => {
    try {
      localStorage.removeItem("medmnemonic_history");
    } catch (e) {
      console.error("Failed to clear localStorage:", e);
    }
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center dark:bg-zinc-950 font-sans text-slate-800 dark:text-zinc-100">
          <div className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-8 shadow-lg dark:border-zinc-800 dark:bg-zinc-900 space-y-6">
            <h2 className="text-xl font-bold">Something went wrong</h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
              An unexpected error occurred. This could be due to corrupted or oversized local data.
            </p>
            <button
              onClick={this.handleReset}
              className="w-full rounded-xl bg-red-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-red-700 transition-all cursor-pointer shadow-sm"
            >
              Clear Local Data &amp; Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
