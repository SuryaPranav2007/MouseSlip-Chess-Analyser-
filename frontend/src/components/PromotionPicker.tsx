import React, { useEffect, useRef } from 'react';

export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

interface PromotionPickerProps {
  color: 'white' | 'black';
  onSelect: (piece: PromotionPiece) => void;
  onCancel: () => void;
  boardSize: number;
  destSquare: string;
  orientation: 'white' | 'black';
}

const PIECES: { letter: PromotionPiece; name: string; cgClass: string }[] = [
  { letter: 'q', name: 'Queen',  cgClass: 'queen'  },
  { letter: 'r', name: 'Rook',   cgClass: 'rook'   },
  { letter: 'b', name: 'Bishop', cgClass: 'bishop' },
  { letter: 'n', name: 'Knight', cgClass: 'knight' },
];

export const PromotionPicker: React.FC<PromotionPickerProps> = ({
  color, onSelect, onCancel, boardSize, destSquare, orientation,
}) => {
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [onCancel]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  const squareSize = boardSize / 8;
  const iconSize = Math.max(36, Math.round(squareSize * 0.68));
  const popupWidth = Math.max(160, Math.round(squareSize * 2.2));
  const file = destSquare.charCodeAt(0) - 97;
  const rank = parseInt(destSquare[1]) - 1;
  const squareLeft = orientation === 'white' ? file * squareSize : (7 - file) * squareSize;
  let left = squareLeft + squareSize / 2 - popupWidth / 2;
  left = Math.max(0, Math.min(boardSize - popupWidth, left));
  const isTopRank = color === 'white';
  const squareTop = orientation === 'white' ? (7 - rank) * squareSize : rank * squareSize;
  const rowHeight = iconSize + 8;
  const top = isTopRank
    ? squareTop + squareSize + 4
    : squareTop - PIECES.length * rowHeight - 8;

  return (
    <>
      <div style={{ position: 'absolute', inset: 0, zIndex: 48 }} aria-hidden="true" />
      <div
        ref={popupRef}
        role="dialog"
        aria-label="Choose promotion piece"
        style={{
          position: 'absolute', top: `${top}px`, left: `${left}px`, width: `${popupWidth}px`,
          zIndex: 49,
          background: 'rgba(12, 12, 14, 0.97)',
          border: '1.5px solid rgba(201, 163, 86, 0.35)',
          borderRadius: '14px', padding: '8px',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.85), 0 0 24px rgba(201,163,86,0.08)',
          display: 'flex', flexDirection: 'column', gap: '4px',
          animation: 'promoPickerPop 0.15s cubic-bezier(0.175,0.885,0.32,1.275) both',
        }}
      >
        {PIECES.map(({ letter, name, cgClass }) => (
          <button
            key={letter}
            onPointerDown={(e) => { e.stopPropagation(); onSelect(letter); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              background: 'transparent', border: 'none', borderRadius: '9px',
              padding: '6px 10px', cursor: 'pointer',
              transition: 'background 0.12s',
              WebkitTapHighlightColor: 'transparent',
              width: '100%', textAlign: 'left', minHeight: `${rowHeight}px`,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(201,163,86,0.13)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
            aria-label={`Promote to ${name}`}
          >
            {/*
              Chessground renders pieces as <piece class="queen white"> inside .cg-wrap.
              We replicate that structure here with a div carrying the same CSS classes,
              so the embedded SVG background-image rules in chessground.cburnett.css apply.
            */}
            <div
              className={`cg-wrap`}
              style={{ position: 'relative', width: `${iconSize}px`, height: `${iconSize}px`, flexShrink: 0 }}
              aria-hidden="true"
            >
              <div
                className={`piece ${cgClass} ${color}`}
                style={{
                  position: 'absolute', inset: 0,
                  backgroundSize: 'contain', backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'center',
                  pointerEvents: 'none',
                }}
              />
            </div>
            <span style={{
              fontFamily: '"Outfit", "Inter", sans-serif',
              fontSize: `${Math.max(12, Math.round(squareSize * 0.19))}px`,
              fontWeight: 600, color: '#EDEAE3', letterSpacing: '0.01em',
              lineHeight: 1, userSelect: 'none',
            }}>
              {name}
            </span>
          </button>
        ))}
      </div>
      <style>{`@keyframes promoPickerPop{from{opacity:0;transform:scale(0.88)}to{opacity:1;transform:scale(1)}}`}</style>
    </>
  );
};

export default PromotionPicker;
