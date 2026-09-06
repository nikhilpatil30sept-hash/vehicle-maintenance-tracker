import React from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * Catches render-time crashes so a single bad value shows a recoverable screen
 * instead of an unexplained blank page.
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
    console.error('Unhandled UI error:', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
        <div className="backdrop-blur-xl bg-white/10 p-10 rounded-3xl max-w-md w-full border border-white/20 text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-300 mx-auto mb-4" />
          <h1 className="text-2xl font-black text-white mb-2">Something went wrong</h1>
          <p className="text-white/70 text-sm mb-6">
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 text-white p-4 rounded-xl font-bold"
          >
            Reload CarKeeper
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
