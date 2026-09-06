import React, { useState } from 'react';
import { Car, Loader2 } from 'lucide-react';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Login / registration screen.
 *
 * This is a real <form>, so the browser enforces `required` and `type="email"`,
 * and Enter submits. The previous markup used <div onSubmit>, which never fires
 * - every validation attribute on it was inert.
 */
const AuthScreen = ({ mode, onModeChange, onLogin, onRegister, notice }) => {
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);

  const isLogin = mode === 'login';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return; // guard against double submission
    setSubmitting(true);
    try {
      if (isLogin) {
        await onLogin(credentials);
      } else {
        await onRegister(credentials);
        setCredentials({ email: '', password: '' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full p-4 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white ' +
    'placeholder-white/60 outline-none focus:bg-white/30 focus:border-cyan-400 transition-all';

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-purple-600 to-pink-500 flex items-center justify-center p-4">
      <div className="backdrop-blur-xl bg-white/10 p-10 rounded-3xl w-full max-w-md shadow-2xl border border-white/20 relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500 shadow-lg mb-4">
            <Car className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-black text-white mb-2">CarKeeper</h1>
          <p className="text-white/80 text-sm">Track your vehicle maintenance with ease</p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="sr-only">Email</span>
            <input
              className={inputClass}
              type="email"
              name="email"
              autoComplete="email"
              placeholder="Email"
              value={credentials.email}
              onChange={(e) => setCredentials({ ...credentials, email: e.target.value })}
              required
            />
          </label>
          <label className="block">
            <span className="sr-only">Password</span>
            <input
              className={inputClass}
              type="password"
              name="password"
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              placeholder={`Password (min. ${MIN_PASSWORD_LENGTH} characters)`}
              value={credentials.password}
              onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
              minLength={MIN_PASSWORD_LENGTH}
              required
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 text-white p-4 rounded-xl font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all disabled:opacity-60 disabled:hover:scale-100 flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="animate-spin" size={16} />}
            {isLogin ? 'Sign In' : 'Create Account'}
          </button>
          {notice && (
            <p className="text-yellow-300 text-center text-sm font-semibold" role="status">
              {notice}
            </p>
          )}
        </form>

        <button
          type="button"
          onClick={() => onModeChange(isLogin ? 'register' : 'login')}
          className="w-full mt-6 text-sm text-white/80 hover:text-white transition-colors"
        >
          {isLogin ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
};

export default AuthScreen;
