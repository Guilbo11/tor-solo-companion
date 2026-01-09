import React from 'react';

export default function OracleSidePanel({
  open,
  onClose,
  children,
  title = 'Oracles',
  ariaLabel,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  ariaLabel?: string;
}) {
  if (!open) return null;
  return (
    <div className="sidePanelOverlay" onMouseDown={(e)=>{ if (e.target===e.currentTarget) onClose(); }}>
      <div className="sidePanel" role="dialog" aria-label={ariaLabel ?? title}>
        <div className="row" style={{justifyContent:'space-between', alignItems:'center', gap:10}}>
          <div className="h2" style={{fontSize:18}}>{title}</div>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
        <div style={{marginTop: 10}}>
          {children}
        </div>
      </div>
    </div>
  );
}
