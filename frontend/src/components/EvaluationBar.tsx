import React from 'react';
import type { CanonicalEval } from '../hooks/useWebSocket';

interface EvaluationBarProps {
  scoreCanonical: CanonicalEval | null;
  orientation: 'white' | 'black';
  isCheckmate?: boolean;
  turnColor?: 'white' | 'black';
}

export const EvaluationBar: React.FC<EvaluationBarProps> = ({ 
  scoreCanonical, 
  orientation,
  isCheckmate = false,
  turnColor = 'white'
}) => {
  const isWhiteBottom = orientation === 'white';
  const bottomColor = isWhiteBottom ? '#eeeed2' : '#1A1A1A';
  const topColor = isWhiteBottom ? '#1A1A1A' : '#eeeed2';

  const isWhiteWinningCheckmate = isCheckmate && turnColor === 'black';

  // If no canonical evaluation, default to equal position (50% split)
  let whitePercentage = 50;
  if (isCheckmate) {
    whitePercentage = isWhiteWinningCheckmate ? 100 : 0;
  } else if (scoreCanonical !== null) {
    whitePercentage = scoreCanonical.white_win_prob * 100;
  }
  
  const bottomHeight = isWhiteBottom ? whitePercentage : 100 - whitePercentage;

  // Set up text labels for terminal states
  let topLabel = '';
  let bottomLabel = '';

  const isWhiteWin = scoreCanonical?.type === 'mate' && scoreCanonical.value === 0 && scoreCanonical.white_win_prob === 1.0;
  const isBlackWin = scoreCanonical?.type === 'mate' && scoreCanonical.value === 0 && scoreCanonical.white_win_prob === 0.0;
  const isDraw = scoreCanonical?.score_str === 'Draw';

  if (isWhiteWin && !isCheckmate) {
    if (isWhiteBottom) {
      topLabel = 'Black = 0';
      bottomLabel = 'White = 1';
    } else {
      topLabel = 'White = 1';
      bottomLabel = 'Black = 0';
    }
  } else if (isBlackWin && !isCheckmate) {
    if (isWhiteBottom) {
      topLabel = 'Black = 1';
      bottomLabel = 'White = 0';
    } else {
      topLabel = 'White = 0';
      bottomLabel = 'Black = 1';
    }
  } else if (isDraw) {
    if (isWhiteBottom) {
      topLabel = 'Black = 0.5';
      bottomLabel = 'White = 0.5';
    } else {
      topLabel = 'White = 0.5';
      bottomLabel = 'Black = 0.5';
    }
  }

  const topTextColor = topColor === '#eeeed2' ? 'text-black/60' : 'text-white/60';
  const bottomTextColor = bottomColor === '#eeeed2' ? 'text-black/60' : 'text-white/60';

  const showDivider = !isWhiteWin && !isBlackWin && !isCheckmate;

  // Position dynamic vertical label based on eval (with clamping near top/bottom edges)
  const clampedHeight = Math.max(6, Math.min(94, bottomHeight));
  const isLabelInBottom = clampedHeight <= bottomHeight;
  const labelBgColor = isLabelInBottom ? bottomColor : topColor;
  const isLabelWhite = labelBgColor === '#eeeed2';
  
  // Proximity to the top/bottom edge (buffer zone: clamped height is near 18% or 82%)
  const isNearEdge = clampedHeight < 18 || clampedHeight > 82;
  const fontSizeClass = isNearEdge ? 'text-[8.5px]' : 'text-[13px]';

  // Fixed center position for middle-zone, dynamic for corner-zone
  const labelTopPosition = isNearEdge ? `${100 - clampedHeight}%` : '50%';

  // Text color swaps to gold (#C9A356) for the fixed center middle-zone
  const labelTextColorClass = isNearEdge 
    ? (isLabelWhite ? 'text-[#1A1A1A]' : 'text-[#EDEAE3]') 
    : 'text-[#C9A356]';

  // Determine winning side positioning for checkmate label
  const isWhiteWinning = isCheckmate ? (turnColor === 'black') : (scoreCanonical?.type === 'mate' ? !scoreCanonical.score_str.includes('-') : parseFloat(scoreCanonical?.score_str || '0') > 0);
  const isWinningAtBottom = isWhiteBottom ? isWhiteWinning : !isWhiteWinning;

  return (
    <div className="relative h-full brass-frame rounded-l-xl select-none"
         style={{ width: '24px', padding: '1px' }}>
      {/* Brass instrument frame — inner surface */}
      <div className="relative w-full h-full bg-[#0A0A0C] rounded-[10px] overflow-hidden flex flex-col justify-between transition-all duration-[250ms]">
      {/* Top portion */}
      <div 
        className="w-full flex-1 transition-all duration-[250ms] ease-out" 
        style={{ backgroundColor: topColor }}
      />
      
      {/* Divider line (hidden when completely saturated checkmate) */}
      {showDivider && (
        <div className="w-full h-[1.5px] bg-white/20 z-10 absolute left-0 right-0 top-1/2 -translate-y-1/2" />
      )}

      {/* Bottom portion */}
      <div 
        className="w-full transition-all duration-[250ms] ease-out shadow-[0_0_10px_rgba(255,255,255,0.05)]"
        style={{ height: `${bottomHeight}%`, backgroundColor: bottomColor }}
      />

      {/* Centered Evaluation Score Label (rotated vertically, moves dynamically with divider) */}
      {scoreCanonical && scoreCanonical.score_str !== 'Draw' && !isWhiteWin && !isBlackWin && !isCheckmate && (
        <div 
          className={`absolute left-1/2 -rotate-90 whitespace-nowrap font-black leading-none tracking-tighter select-none z-20 ${fontSizeClass} ${labelTextColorClass}`}
          style={{ 
            top: labelTopPosition,
            transform: 'translate(-50%, -50%) rotate(-90deg)',
            transformOrigin: 'center',
            fontFamily: '"JetBrains Mono", monospace',
            textShadow: isNearEdge 
              ? (isLabelWhite ? '0 0 1px rgba(255,255,255,0.4)' : '0 0 1px rgba(0,0,0,0.6)') 
              : '0 0 2px rgba(10, 10, 12, 0.95)',
            transition: 'top 200ms ease-in-out'
          }}
        >
          {scoreCanonical.score_str}
        </div>
      )}

      {/* Checkmate "1" Label */}
      {isCheckmate && (
        <div 
          className={`absolute ${isWinningAtBottom ? 'bottom-5' : 'top-5'} left-1/2 -translate-x-1/2 -rotate-90 whitespace-nowrap text-[11px] font-black leading-none tracking-tighter select-none z-20 ${
            (turnColor === 'black') ? 'text-[#1A1A1A]' : 'text-[#EDEAE3]'
          }`}
          style={{ transformOrigin: 'center', fontFamily: '"JetBrains Mono", monospace' }}
        >
          1
        </div>
      )}

      {/* Horizontal non-rotated score badge pinned at the top/bottom based on winning side */}
      {scoreCanonical && scoreCanonical.score_str !== 'Draw' && !isCheckmate && (
        <div 
          className={`absolute left-1/2 -translate-x-1/2 z-30 px-1 py-0.5 rounded-sm bg-[#0F0F11] border border-[#C9A356]/45 text-[#C9A356] text-[9px] font-black shadow-md flex items-center justify-center min-w-[28px] ${
            (() => {
              const scoreStr = scoreCanonical.score_str;
              const isMate = scoreStr.includes('M');
              const isWhiteWinningVal = isMate ? !scoreStr.includes('-') : parseFloat(scoreStr) > 0;
              const isAtBottom = isWhiteBottom ? isWhiteWinningVal : !isWhiteWinningVal;
              return isAtBottom ? 'bottom-1' : 'top-1';
            })()
          }`}
          style={{ fontFamily: '"JetBrains Mono", monospace' }}
        >
          {scoreCanonical.score_str}
        </div>
      )}

      {/* Text Labels Overlay (rotated vertically to fit narrow 22px bar) */}
      {topLabel && (
        <div 
          className={`absolute top-14 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 whitespace-nowrap text-[8px] font-black uppercase tracking-wider select-none z-20 ${topTextColor}`}
          style={{ transformOrigin: 'center' }}
        >
          {topLabel}
        </div>
      )}
      {bottomLabel && (
        <div 
          className={`absolute bottom-14 left-1/2 -translate-x-1/2 translate-y-1/2 -rotate-90 whitespace-nowrap text-[8px] font-black uppercase tracking-wider select-none z-20 ${bottomTextColor}`}
          style={{ transformOrigin: 'center' }}
        >
          {bottomLabel}
        </div>
      )}
      </div>
    </div>
  );
};

export default EvaluationBar;
