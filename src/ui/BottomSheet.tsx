import React, { useEffect } from 'react';

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
};

export default function BottomSheet({ open, title, onClose, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="bs-backdrop" onClick={onClose}>
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
