import React, { useEffect } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

/**
 * Notification toast.
 *
 * Success and failure are separate `tone` values now. Previously both were
 * stuffed into one `error` string and the styling was chosen by sniffing for
 * the substring "Found".
 */
const Toast = ({ message, tone = 'error', onDismiss, autoDismissMs = 6000 }) => {
  useEffect(() => {
    if (!message || !autoDismissMs) return undefined;
    const timer = setTimeout(onDismiss, autoDismissMs);
    return () => clearTimeout(timer);
  }, [message, autoDismissMs, onDismiss]);

  if (!message) return null;

  const isSuccess = tone === 'success';

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="toast"
      className={`fixed bottom-6 right-6 p-5 rounded-2xl shadow-2xl flex items-center gap-3 z-50 backdrop-blur-xl border max-w-md ${
        isSuccess
          ? 'bg-green-500/90 border-green-400 text-white'
          : 'bg-red-500/90 border-red-400 text-white'
      }`}
    >
      {isSuccess ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
      <div className="flex-1">
        <p className="text-xs font-bold opacity-80">{isSuccess ? 'Success' : 'System Alert'}</p>
        <p className="text-sm font-black">{message}</p>
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={onDismiss}
        className="bg-white/20 hover:bg-white/30 p-2 rounded-lg font-bold transition-colors"
      >
        ✕
      </button>
    </div>
  );
};

export default Toast;
