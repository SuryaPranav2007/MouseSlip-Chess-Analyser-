import React, { useEffect, useRef } from 'react';

export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

// Base64 SVG sprites extracted directly from chessground.cburnett.css
// (black piece variants — we recolor to green via CSS filter)
const PIECE_SVG: Record<PromotionPiece, string> = {
  q: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0NSIgaGVpZ2h0PSI0NSI+PGcgZmlsbC1ydWxlPSJldmVub2RkIiBzdHJva2U9IiMwMDAiIHN0cm9rZS13aWR0aD0iMS41IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxnIHN0cm9rZT0ibm9uZSI+PGNpcmNsZSBjeD0iNiIgY3k9IjEyIiByPSIyLjc1Ii8+PGNpcmNsZSBjeD0iMTQiIGN5PSI5IiByPSIyLjc1Ii8+PGNpcmNsZSBjeD0iMjIuNSIgY3k9IjgiIHI9IjIuNzUiLz48Y2lyY2xlIGN4PSIzMSIgY3k9IjkiIHI9IjIuNzUiLz48Y2lyY2xlIGN4PSIzOSIgY3k9IjEyIiByPSIyLjc1Ii8+PC9nPjxwYXRoIGQ9Ik05IDI2YzguNS0xLjUgMjEtMS41IDI3IDBsMi41LTEyLjVMMzEgMjVsLS4zLTE0LjEtNS4yIDEzLjYtMy0xNC41LTMgMTQuNS01LjItMTMuNkwxNCAyNSA2LjUgMTMuNSA5IDI2eiIgc3Ryb2tlLWxpbmVjYXA9ImJ1dHQiLz48cGF0aCBkPSJNOSAyNmMwIDIgMS41IDIgMi41IDQgMSAxLjUgMSAxIC41IDMuNS0xLjUgMS0xLjUgMi41LTEuNSAyLjUtMS41IDEuNS41IDIuNS41IDIuNSA2LjUgMSAxNi41IDEgMjMgMCAwIDAgMS41LTEgMC0yLjUgMCAwIC41LTEuNS0xLTIuNS0uNS0yLjUtLjUtMiAuNS0zLjUgMS0yIDIuNS0yIDIuNS00LTguNS0xLjUtMTguNS0xLjUtMjcgMHoiIHN0cm9rZS1saW5lY2FwPSJidXR0Ii8+PHBhdGggZD0iTTExIDM4LjVhMzUgMzUgMSAwIDAgMjMgMCIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9ImJ1dHQiLz48cGF0aCBkPSJNMTEgMjlhMzUgMzUgMSAwIDEgMjMgMG0tMjEuNSAyLjVoMjBtLTIxIDNhMzUgMzUgMSAwIDAgMjIgMG0tMjMgM2EzNSAzNSAxIDAgMCAyNCAwIiBmaWxsPSJub25lIiBzdHJva2U9IiNlY2VjZWMiLz48L2c+PC9zdmc+',
  r: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0NSIgaGVpZ2h0PSI0NSI+PGcgZmlsbC1ydWxlPSJldmVub2RkIiBzdHJva2U9IiMwMDAiIHN0cm9rZS13aWR0aD0iMS41IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Ik05IDM5aDI3di0zSDl2M3ptMy41LTdsMS41LTIuNWgxN2wxLjUgMi41aC0yMHptLS41IDR2LTRoMjF2NEgxMnoiIHN0cm9rZS1saW5lY2FwPSJidXR0Ii8+PHBhdGggZD0iTTE0IDI5LjV2LTEzaDE3djEzSDE0eiIgc3Ryb2tlLWxpbmVjYXA9ImJ1dHQiIHN0cm9rZS1saW5lam9pbj0ibWl0ZXIiLz48cGF0aCBkPSJNMTQgMTYuNUwxMSAxNGgyM2wtMyAyLjVIMTR6TTExIDE0VjloNHYyaDVWOWg1djJoNVY5aDR2NUgxMXoiIHN0cm9rZS1saW5lY2FwPSJidXR0Ii8+PHBhdGggZD0iTTEyIDM1LjVoMjFtLTIwLTRoMTltLTE4LTJoMTdtLTE3LTEzaDE3TTExIDE0aDIzIiBmaWxsPSJub25lIiBzdHJva2U9IiNlY2VjZWMiIHN0cm9rZS13aWR0aD0iMSIgc3Ryb2tlLWxpbmVqb2luPSJtaXRlciIvPjwvZz48L3N2Zz4=',
  b: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0NSIgaGVpZ2h0PSI0NSI+PGcgZmlsbD0ibm9uZSIgZmlsbC1ydWxlPSJldmVub2RkIiBzdHJva2U9IiMwMDAiIHN0cm9rZS13aWR0aD0iMS41IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxnIGZpbGw9IiMwMDAiIHN0cm9rZS1saW5lY2FwPSJidXR0Ij48cGF0aCBkPSJNOSAzNmMzLjM5LS45NyAxMC4xMS40MyAxMy41LTIgMy4zOSAyLjQzIDEwLjExIDEuMDMgMTMuNSAyIDAgMCAxLjY1LjU0IDMgMi0uNjguOTctMS42NS45OS0zIC41LTMuMzktLjk3LTEwLjExLjQ2LTEzLjUtMS0zLjM5IDEuNDYtMTAuMTEuMDMtMTMuNSAxLTEuMzU0LjQ5LTIuMzIzLjQ3LTMtLjUgMS4zNTQtMS45NCAzLTIgMy0yeiIvPjxwYXRoIGQ9Ik0xNSAzMmMyLjUgMi41IDEyLjUgMi41IDE1IDAgLjUtMS41IDAtMiAwLTIgMC0yLjUtMi41LTQtMi41LTQgNS41LTEuNSA2LTExLjUtNS0xNS41LTExIDQtMTAuNSAxNC01IDE1LjUgMCAwLTIuNSAxLjUtMi41IDQgMCAwLS41LjUgMCAyeiIvPjxwYXRoIGQ9Ik0yNSA4YTIuNSAyLjUgMCAxIDEtNSAwIDIuNSAyLjUgMCAxIDEgNSAweiIvPjwvZz48cGF0aCBkPSJNMTcuNSAyNmgxME0xNSAzMGgxNW0tNy41LTE0LjV2NU0yMCAxOGg1IiBzdHJva2U9IiNlY2VjZWMiIHN0cm9rZS1saW5lam9pbj0ibWl0ZXIiLz48L2c+PC9zdmc+',
  n: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0NSIgaGVpZ2h0PSI0NSI+PGcgZmlsbD0ibm9uZSIgZmlsbC1ydWxlPSJldmVub2RkIiBzdHJva2U9IiMwMDAiIHN0cm9rZS13aWR0aD0iMS41IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Ik0yMiAxMGMxMC41IDEgMTYuNSA4IDE2IDI5SDE1YzAtOSAxMC02LjUgOC0yMSIgZmlsbD0iIzAwMCIvPjxwYXRoIGQ9Ik0yNCAxOGMuMzggMi45MS01LjU1IDcuMzctOCA5LTMgMi0yLjgyIDQuMzQtNSA0LTEuMDQyLS45NCAxLjQxLTMuMDQgMC0zLTEgMCAuMTkgMS4yMy0xIDItMSAwLTQuMDAzIDEtNC00IDAtMiA2LTEyIDYtMTJzMS44OS0xLjkgMi0zLjVjLS43My0uOTk0LS41LTItLjUtMyAxLTEgMyAyLjUgMyAyLjVoMnMuNzgtMS45OTIgMi41LTNjMSAwIDEgMyAxIDMiIGZpbGw9IiMwMDAiLz48cGF0aCBkPSJNOS41IDI1LjVhLjUuNSAwIDEgMS0xIDAgLjUuNSAwIDEgMSAxIDB6bTUuNDMzLTkuNzVhLjUgMS41IDMwIDEgMS0uODY2LS41LjUgMS41IDMwIDEgMSAuODY2LjV6IiBmaWxsPSIjZWNlY2VjIiBzdHJva2U9IiNlY2VjZWMiLz48cGF0aCBkPSJNMjQuNTUgMTAuNGwtLjQ1IDEuNDUuNS4xNWMzLjE1IDEgNS42NSAyLjQ5IDcuOSA2Ljc1UzM1Ljc1IDI5LjA2IDM1LjI1IDM5bC0uMDUuNWgyLjI1bC4wNS0uNWMuNS0xMC4wNi0uODgtMTYuODUtMy4yNS0yMS4zNC0yLjM3LTQuNDktNS43OS02LjY0LTkuMTktNy4xNmwtLjUxLS4xeiIgZmlsbD0iI2VjZWNlYyIgc3Ryb2tlPSJub25lIi8+PC9nPjwvc3ZnPg==',
};

const PIECES: { letter: PromotionPiece; name: string }[] = [
  { letter: 'q', name: 'Queen'  },
  { letter: 'r', name: 'Rook'   },
  { letter: 'b', name: 'Bishop' },
  { letter: 'n', name: 'Knight' },
];

// CSS filter that turns the black piece SVG into a vibrant green
// Approximates #22c55e (Tailwind green-500)
const GREEN_FILTER =
  'brightness(0) saturate(100%) invert(63%) sepia(61%) saturate(450%) hue-rotate(100deg) brightness(0.92)';

interface PromotionPickerProps {
  onSelect: (piece: PromotionPiece) => void;
  onCancel: () => void;
  boardSize: number;
}

export const PromotionPicker: React.FC<PromotionPickerProps> = ({
  onSelect,
  onCancel,
  boardSize,
}) => {
  const popupRef = useRef<HTMLDivElement>(null);

  // Click-away cancel (capture phase so we catch it before Chessground)
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [onCancel]);

  // Escape key cancel
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  // Sizing — relative to board, always readable
  const iconSize = Math.max(36, Math.round(boardSize * 0.085));
  const fontSize = Math.max(13, Math.round(boardSize * 0.028));
  const rowPad  = Math.round(iconSize * 0.2);
  const popupW  = Math.max(180, iconSize * 3.8);

  return (
    <>
      {/* Full-board dim overlay — covers board area, captures click-away */}
      <div
        style={{
          position: 'absolute', inset: 0, zIndex: 48,
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(1px)',
        }}
        aria-hidden="true"
      />

      {/* Popup — always centered over the board */}
      <div
        ref={popupRef}
        role="dialog"
        aria-label="Choose promotion piece"
        style={{
          position: 'absolute',
          // Center horizontally and vertically within the board container
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: `${popupW}px`,
          zIndex: 49,
          background: 'rgba(10, 10, 13, 0.98)',
          border: '1.5px solid rgba(34, 197, 94, 0.40)',
          borderRadius: '16px',
          padding: '10px 8px',
          backdropFilter: 'blur(16px)',
          boxShadow:
            '0 0 0 1px rgba(34,197,94,0.08), 0 20px 60px rgba(0,0,0,0.9), 0 0 32px rgba(34,197,94,0.10)',
          display: 'flex', flexDirection: 'column', gap: '4px',
          animation: 'promoPickerPop 0.18s cubic-bezier(0.175,0.885,0.32,1.275) both',
        }}
      >
        {/* Heading */}
        <div style={{
          textAlign: 'center',
          fontFamily: '"Outfit", "Inter", sans-serif',
          fontSize: `${Math.max(10, fontSize - 2)}px`,
          fontWeight: 700,
          color: 'rgba(34,197,94,0.75)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          paddingBottom: '6px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          marginBottom: '2px',
          userSelect: 'none',
        }}>
          Promote to
        </div>

        {PIECES.map(({ letter, name }) => (
          <button
            key={letter}
            onPointerDown={(e) => { e.stopPropagation(); onSelect(letter); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              background: 'transparent', border: 'none',
              borderRadius: '10px',
              padding: `${rowPad}px 14px`,
              cursor: 'pointer',
              transition: 'background 0.12s, transform 0.08s',
              WebkitTapHighlightColor: 'transparent',
              width: '100%', textAlign: 'left',
            }}
            onMouseEnter={e => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.background = 'rgba(34,197,94,0.12)';
              b.style.transform = 'scale(1.02)';
            }}
            onMouseLeave={e => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.background = 'transparent';
              b.style.transform = 'scale(1)';
            }}
            aria-label={`Promote to ${name}`}
          >
            {/* Piece icon — raw base64 <img>, recolored green via CSS filter */}
            <img
              src={PIECE_SVG[letter]}
              alt={name}
              width={iconSize}
              height={iconSize}
              draggable={false}
              style={{
                width: `${iconSize}px`,
                height: `${iconSize}px`,
                flexShrink: 0,
                filter: GREEN_FILTER,
                pointerEvents: 'none',
                userSelect: 'none',
              }}
            />
            <span style={{
              fontFamily: '"Outfit", "Inter", sans-serif',
              fontSize: `${fontSize}px`,
              fontWeight: 600,
              color: '#EDEAE3',
              letterSpacing: '0.01em',
              lineHeight: 1,
              userSelect: 'none',
            }}>
              {name}
            </span>
          </button>
        ))}
      </div>

      <style>{`
        @keyframes promoPickerPop {
          from { opacity: 0; transform: translate(-50%,-50%) scale(0.85); }
          to   { opacity: 1; transform: translate(-50%,-50%) scale(1); }
        }
      `}</style>
    </>
  );
};

export default PromotionPicker;
