import React, { useEffect, useRef, useState } from 'react';

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
  const timerRef = useRef<number | null>(null);
  const unmountTimerRef = useRef<number | null>(null);
  const queueRef = useRef<ToastPayload[]>([]);
  const showingRef = useRef(false);

  useEffect(() => {
    const showNext = () => {
      const next = queueRef.current.shift();
      if (!next) {
        showingRef.current = false;
        return;
      }
      showingRef.current = true;
      const m = String(next?.message ?? '').trim();
      if (!m) {
        showNext();
        return;
      }

      setMsg(m);
      setType((next?.type as ToastType) || 'info');
      setMounted(true);
      if (unmountTimerRef.current) window.clearTimeout(unmountTimerRef.current);
      window.setTimeout(() => setOpen(true), 0);

      const ms = typeof next?.durationMs === 'number' ? next.durationMs : 4000;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        setOpen(false);
        if (unmountTimerRef.current) window.clearTimeout(unmountTimerRef.current);
        unmountTimerRef.current = window.setTimeout(() => {
          setMounted(false);
          showNext();
        }, 280);
      }, ms);
    };

    (window as any).__torcToast = (p: ToastPayload) => {
      queueRef.current.push(p);
      if (!showingRef.current) showNext();
    };
    return () => {
      (window as any).__torcToast = undefined;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (unmountTimerRef.current) window.clearTimeout(unmountTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!mounted) return null;

  return (
    <div className={`torcToast torcToast-${type} ${open ? 'isOpen' : ''}`} role="status" aria-live="polite">
      <div className="torcToastMsg">{msg}</div>
    </div>
  );
}
