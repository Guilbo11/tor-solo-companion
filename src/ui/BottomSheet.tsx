import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  closeOnBackdrop?: boolean;
  closeOnEsc?: boolean;
};

export default function BottomSheet({ open, title, onClose, children, closeOnBackdrop = false, closeOnEsc = true }: Props) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && closeOnEsc) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, closeOnEsc]);


  useEffect(() => {
    if (!open) return;
    // Ensure the sheet opens at the top of its internal scroll area
    requestAnimationFrame(() => {
      if (bodyRef.current) bodyRef.current.scrollTop = 0;
    });
  }, [open]);
  if (!open) return null;

  return createPortal(
    <div className="bs-backdrop" onClick={()=>{ if (closeOnBackdrop) onClose(); }}>
      <div className="bs-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="bs-header">
          <div className="bs-title">{title}</div>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
        <div className="bs-body" ref={bodyRef}>{children}</div>
      </div>
    </div>
  );
}