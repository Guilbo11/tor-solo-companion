import React, { useEffect } from 'react';

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  closeOnBackdrop?: boolean;
  closeOnEsc?: boolean;
};

export default function BottomSheet({ open, title, onClose, children, closeOnBackdrop = false, closeOnEsc = true }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && closeOnEsc) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, closeOnEsc]);

  if (!open) return null;

  return (
    <div className="bs-backdrop" onClick={()=>{ if (closeOnBackdrop) onClose(); }}>
      <div className="bs-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="bs-header">
          <div className="bs-title">{title}</div>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
        <div className="bs-body">{children}</div>
      </div>
    </div>
  );
}
