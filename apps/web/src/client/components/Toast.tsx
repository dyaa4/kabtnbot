import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

interface ToastItem {
  id: number;
  kind: 'success' | 'error';
  text: string;
}

interface ToastApi {
  success(text: string): void;
  error(text: string): void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TOAST_MS = 3200;

/** App-wide toast notifications: bottom-center, auto-dismissing, screen-reader friendly. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const push = useCallback((kind: ToastItem['kind'], text: string) => {
    const id = nextId.current++;
    setToasts((ts) => [...ts, { id, kind, text }]);
    setTimeout(() => setToasts((ts) => ts.filter((toast) => toast.id !== id)), TOAST_MS);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({ success: (text) => push('success', text), error: (text) => push('error', text) }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-6 left-1/2 z-[60] grid w-full max-w-md -translate-x-1/2 justify-items-center gap-2 px-4"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            // Error toasts keep the historic save-error testid so save-failure specs stay stable.
            data-testid={toast.kind === 'error' ? 'save-error' : 'toast-success'}
            className={
              toast.kind === 'success'
                ? 'rounded-xl border border-emerald-500/40 bg-emerald-950/90 px-4 py-2.5 text-sm font-semibold text-emerald-300 shadow-lg backdrop-blur-md'
                : 'rounded-xl border border-red-500/40 bg-red-950/90 px-4 py-2.5 text-sm font-semibold text-red-300 shadow-lg backdrop-blur-md'
            }
          >
            {toast.kind === 'success' ? '✓ ' : ''}
            {toast.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast outside ToastProvider');
  return ctx;
}
