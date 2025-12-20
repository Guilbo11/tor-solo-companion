
import React, { useEffect } from 'react';

export function BottomSheet(props: {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { open, onClose } = props;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="sheetOverlay" onMouseDown={onClose}>
      <div className="sheet" onMouseDown={(e) => e.stopPropagation()}>
        <div className="sheetHeader">
          <div className="sheetTitle">{props.title ?? ''}</div>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
        <div className="sheetBody">{props.children}</div>
      </div>
    </div>
  );
}
