import React from 'react';

export default function FloatingOracleButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="fab-btn" title="Oracles" onClick={onClick} aria-label="Open Oracles">
      🔮
    </button>
  );
}
