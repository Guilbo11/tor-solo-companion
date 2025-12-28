import React, { useEffect, useState } from 'react';

type ToastType = 'info' | 'success' | 'warning' | 'error';

export type ToastPayload = {
  message: string;
  type?: ToastType;
  durationMs?: number;
};

/**
 * Lightweight bottom toast.
 * Usage (anywhere): (window as any).__torcToast?.({ message: '...', type: 'success' })
 */
export default function ToastHost() {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [type, setType] = useState<ToastType>('info');
  const [timer, setTimer] = useState<number | null>(null);

  useEffect(() => {
    (window as any).__torcToast = (p: ToastPayload) => {
      const m = String(p?.message ?? '').trim();
      if (!m) return;

      setMsg(m);
      setType((p?.type as ToastType) || 'info');
      setOpen(true);

      const ms = typeof p?.durationMs === 'number' ? p.durationMs : 4000;
      if (timer) window.clearTimeout(timer);
      const id = window.setTimeout(() => setOpen(false), ms);
      setTimer(id);
    };
    return () => {
      (window as any).__torcToast = undefined;
      if (timer) window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer]);

  if (!open) return null;

  return (
    <div className={`torcToast torcToast-${type}`} role="status" aria-live="polite">
      <div className="torcToastMsg">{msg}</div>
    </div>
  );
}
