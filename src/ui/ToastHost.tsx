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
  const [mounted, setMounted] = useState(false);
  const [msg, setMsg] = useState('');
  const [type, setType] = useState<ToastType>('info');
  const [timer, setTimer] = useState<number | null>(null);
  const [unmountTimer, setUnmountTimer] = useState<number | null>(null);

  useEffect(() => {
    (window as any).__torcToast = (p: ToastPayload) => {
      const m = String(p?.message ?? '').trim();
      if (!m) return;

      setMsg(m);
      setType((p?.type as ToastType) || 'info');
      setMounted(true);
      // If we were fading out, cancel the pending unmount.
      if (unmountTimer) window.clearTimeout(unmountTimer);
      // Next tick ensures CSS transition triggers reliably.
      window.setTimeout(() => setOpen(true), 0);

      const ms = typeof p?.durationMs === 'number' ? p.durationMs : 4000;
      if (timer) window.clearTimeout(timer);
      const id = window.setTimeout(() => {
        setOpen(false);
        // Allow fade-out transition before unmounting.
        if (unmountTimer) window.clearTimeout(unmountTimer);
        const uid = window.setTimeout(() => setMounted(false), 280);
        setUnmountTimer(uid);
      }, ms);
      setTimer(id);
    };
    return () => {
      (window as any).__torcToast = undefined;
      if (timer) window.clearTimeout(timer);
      if (unmountTimer) window.clearTimeout(unmountTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer, unmountTimer]);

  if (!mounted) return null;

  return (
    <div className={`torcToast torcToast-${type} ${open ? 'isOpen' : ''}`} role="status" aria-live="polite">
      <div className="torcToastMsg">{msg}</div>
    </div>
  );
}
