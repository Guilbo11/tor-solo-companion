import React from 'react';

type Props = {
  onClick: () => void;
  ariaLabel?: string;
};

export default function FloatingDieButton({ onClick, ariaLabel = 'Open dice roller' }: Props) {
  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel} className="fab-btn">
      🎲
    </button>
  );
}
