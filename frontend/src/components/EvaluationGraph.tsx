import React, { useRef, useMemo, useEffect } from 'react';
import type { MoveItem } from './MoveList';

interface EvaluationGraphProps {
  moves: MoveItem[];
  currentIndex: number;
  hoveredIndex?: number | null;
  onHoverMove?: (index: number | null) => void;
  onSelectMove: (index: number) => void;
}

// Move classification marker color helper
const getClassificationColor = (cls?: string) => {
  if (!cls) return null;
  switch (cls.toLowerCase()) {
    case 'brilliant':
      return '#00bcd4'; // Cyan
    case 'great':
      return '#3b82f6'; // Blue
    case 'book':
      return '#f59e0b'; // Gold/orange
    case 'best':
    case 'excellent':
      return '#81b64c'; // Green
    case 'good':
      return '#5c8a36'; // Duller Green
    case 'inaccuracy':
      return '#f5c400'; // Yellow
    case 'mistake':
      return '#f09235'; // Orange
    case 'miss':
    case 'blunder':
      return '#fa412d'; // Red
    default:
      return null;
  }
};

interface StaticGraphLayerProps {
  points: any[];
  splinePath: string;
  fillPath: string;
  currentIndex: number;
  width: number;
  height: number;
  centerY: number;
}

// Static layer memoized to prevent re-rendering of paths and markers during mouse scrubs
const StaticGraphLayer: React.FC<StaticGraphLayerProps> = React.memo(({
  points,
  splinePath,
  fillPath,
  currentIndex,
  width,
  height,
  centerY
}) => {
  const currentPt = points[currentIndex + 1] || points[0];

  return (
    <g key="static-layer-g">
      {/* Background horizontal grid helper lines */}
      <line 
        key="grid-plus-4"
        x1={0} 
        y1={centerY - (height / 2 - 8) * 0.5} 
        x2={width} 
        y2={centerY - (height / 2 - 8) * 0.5} 
        stroke="rgba(255, 255, 255, 0.03)" 
        strokeWidth="1" 
      />
      <line 
        key="grid-minus-4"
        x1={0} 
        y1={centerY + (height / 2 - 8) * 0.5} 
        x2={width} 
        y2={centerY + (height / 2 - 8) * 0.5} 
        stroke="rgba(255, 255, 255, 0.03)" 
        strokeWidth="1" 
      />

      {/* Equality reference line (prominent 0.00 axis) */}
      <line 
        key="ref-line"
        x1={0} 
        y1={centerY} 
        x2={width} 
        y2={centerY} 
        stroke="rgba(255, 255, 255, 0.20)" 
        strokeWidth="1.5" 
        strokeDasharray="4 3" 
      />

      {/* Soft fill beneath curve */}
      <path 
        key="fill-path"
        d={fillPath} 
        fill="url(#goldGradient)"
        className="transition-all duration-300 ease-out"
      />

      {/* Smooth Bezier spline curve */}
      <path 
        key="spline-path"
        d={splinePath} 
        fill="none" 
        stroke="rgba(197, 160, 89, 0.65)" 
        strokeWidth="2.5" 
        strokeLinecap="round"
        strokeLinejoin="round"
        className="transition-all duration-300 ease-out"
      />

      {/* Interactive Move Classification Markers */}
      {points.map((p) => {
        if (p.idx === -1) return null;
        const color = getClassificationColor(p.classification) || '#C9A356';
        const isSelected = currentIndex === p.idx;

        return (
          <circle
            key={`marker-${p.idx}`}
            cx={p.x}
            cy={p.y}
            r={isSelected ? 4.5 : 2.5}
            fill={color}
            stroke="#151517"
            strokeWidth={isSelected ? 1.5 : 1}
            className="transition-all duration-150 ease-out"
          />
        );
      })}

      {/* Current selected move line guideline */}
      <line
        key="selected-line"
        x1={0}
        y1={0}
        x2={0}
        y2={height}
        stroke="rgba(197, 160, 89, 0.35)"
        strokeWidth="1.5"
        style={{
          transform: `translateX(${currentPt.x}px)`,
          transition: typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches 
            ? 'none' 
            : 'transform var(--transition-glide)'
        }}
      />

      {/* Glowing dot for currently navigated position */}
      <circle
        key="selected-dot"
        cx={0}
        cy={0}
        r="5.5"
        fill="#ffffff"
        stroke="#C9A356"
        strokeWidth="3"
        style={{
          transform: `translate(${currentPt.x}px, ${currentPt.y}px)`,
          transition: typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches 
            ? 'none' 
            : 'transform var(--transition-glide)'
        }}
      />
    </g>
  );
});

StaticGraphLayer.displayName = 'StaticGraphLayer';

export const EvaluationGraph: React.FC<EvaluationGraphProps> = ({
  moves,
  currentIndex,
  onHoverMove,
  onSelectMove
}) => {
  const containerRef = useRef<SVGSVGElement>(null);
  const guidelineRef = useRef<SVGLineElement>(null);
  const hoverDotRef = useRef<SVGCircleElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const rafId = useRef<number | null>(null);

  // Height and layout parameters
  const height = 240; // Increased height significantly (from 140 to 240)
  const paddingX = 16;
  const centerY = height / 2;
  const maxScoreVal = 10.0; 

  const minSpacingPerMove = 22; // Sensible minimum spacing per move in pixels
  const minWidth = 600;
  const calculatedWidth = useMemo(() => {
    return Math.max(minWidth, (moves.length + 1) * minSpacingPerMove + 2 * paddingX);
  }, [moves.length]); 

  // Clean animation frame on unmount
  useEffect(() => {
    return () => {
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, []);

  const parseToCanonicalEval = (scoreStr: string, cp?: number) => {
    if (!scoreStr) {
      return { type: 'cp', value: 0, score_str: '0.00', white_win_prob: 0.5, normalized: 0.0 };
    }
    if (scoreStr === 'Draw' || scoreStr === 'Draw — Stalemate' || scoreStr === 'Stalemate') {
      return { type: 'cp', value: 0, score_str: 'Draw', white_win_prob: 0.5, normalized: 0.0 };
    }
    
    const isMate = scoreStr.includes('M') || scoreStr.includes('m') || scoreStr === 'W' || scoreStr === 'B';
    if (isMate) {
      let val = 0;
      if (scoreStr === 'M0' || scoreStr === 'W' || scoreStr === 'B') {
        val = 0;
      } else if (scoreStr.startsWith('-M') || scoreStr.startsWith('-m') || scoreStr.startsWith('-')) {
        val = -parseInt(scoreStr.replace(/[-Mm]/g, ''), 10);
      } else {
        val = parseInt(scoreStr.replace(/[+Mm]/g, ''), 10);
      }
      
      let whiteWinProb = 0.5;
      let normalized = 0.0;
      if (val === 0) {
        const isBlackWin = scoreStr.startsWith('-') || scoreStr.startsWith('b') || scoreStr.startsWith('B') || scoreStr.includes('-M');
        whiteWinProb = isBlackWin ? 0.0 : 1.0;
        normalized = isBlackWin ? -10.0 : 10.0;
      } else if (val > 0) {
        whiteWinProb = 1.0 - Math.min(20, val) * 0.001;
        normalized = 10.0 - Math.min(9, val) * 0.1;
      } else {
        whiteWinProb = 0.0 + Math.min(20, Math.abs(val)) * 0.001;
        normalized = -10.0 + Math.min(9, Math.abs(val)) * 0.1;
      }
      return {
        type: 'mate',
        value: val,
        score_str: scoreStr === 'W' ? 'M0' : (scoreStr === 'B' ? '-M0' : scoreStr),
        white_win_prob: whiteWinProb,
        normalized
      };
    } else {
      let val = cp !== undefined && cp !== 0 ? cp : 0;
      if (val === 0 && scoreStr !== '0.00' && scoreStr !== '0') {
        try {
          const floatVal = parseFloat(scoreStr);
          if (!isNaN(floatVal)) {
            val = Math.round(floatVal * 100);
          }
        } catch (e) {
          console.warn('Error parsing scoreStr:', e);
        }
      }
      const normalized = Math.max(-9.0, Math.min(9.0, val / 100.0));
      const whiteWinProb = 1.0 / (1.0 + Math.pow(10, -val / 400.0));
      return {
        type: 'cp',
        value: val,
        score_str: scoreStr,
        white_win_prob: whiteWinProb,
        normalized
      };
    }
  };

  // Parse evaluations to numeric scores from White's perspective
  const parseScore = (m: MoveItem): number => {
    if (m.eval_canonical) {
      return m.eval_canonical.normalized;
    }
    const parsed = parseToCanonicalEval(m.eval || '', 0);
    return parsed.normalized;
  };

  // Memoize data points computation to avoid redundant calculations
  const points = useMemo(() => {
    const scores = [0.35, ...(moves ? moves.map(parseScore) : [])];
    const totalPoints = scores.length;

    const scoreToY = (score: number): number => {
      const clamped = Math.max(-maxScoreVal, Math.min(maxScoreVal, score));
      return centerY - (clamped / maxScoreVal) * (height / 2 - 8);
    };

    return scores.map((score, idx) => {
      const x = totalPoints === 1
        ? calculatedWidth / 2
        : paddingX + (idx / (totalPoints - 1)) * (calculatedWidth - 2 * paddingX);
      const y = scoreToY(score);
      const move = moves && idx > 0 ? moves[idx - 1] : null;
      return {
        x,
        y,
        score,
        idx: idx - 1, 
        classification: move?.classification,
        moveItem: move
      };
    });
  }, [moves, calculatedWidth]);

  // Compute smooth Bezier spline interpolation curve path
  const splinePath = useMemo(() => {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cp1x = p0.x + (p1.x - p0.x) / 3;
      const cp1y = p0.y;
      const cp2x = p0.x + 2 * (p1.x - p0.x) / 3;
      const cp2y = p1.y;
      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p1.x} ${p1.y}`;
    }
    return path;
  }, [points]);

  // Compute filled area polygon path
  const fillPath = useMemo(() => {
    if (points.length === 0) return '';
    return `${splinePath} L ${points[points.length - 1].x} ${centerY} L ${points[0].x} ${centerY} Z`;
  }, [points, splinePath]);

  // Lightweight update of tooltip inner HTML content directly in DOM (no React state updates)
  const updateTooltipDOM = (pt: any) => {
    if (!tooltipRef.current) return;
    const move = pt.moveItem;
    const idx = pt.idx;
    const isStart = idx === -1;
    
    const san = move?.san || '';
    const moveStr = isStart ? 'Start Position' : `Move ${Math.floor(idx / 2) + 1}${idx % 2 === 0 ? '.' : '...'} ${san}`;
    const classification = pt.classification || '';
    const score = move?.eval_canonical?.score_str || move?.eval || (isStart ? '+0.35' : '0.00');
    const cpl = (move?.diagnostics as any)?.cpl !== undefined ? (move.diagnostics as any).cpl : 0;
    const accuracy = move?.accuracy !== undefined ? `${move.accuracy}%` : '100%';
    const depth = (move?.diagnostics as any)?.depth || '12';
    const color = getClassificationColor(classification) || '#C9A356';

    tooltipRef.current.innerHTML = `
      <div class="flex items-center justify-between gap-4 border-b border-white/5 pb-1">
        <span class="font-bold text-[#EDEAE3] text-[11px]">${moveStr}</span>
        ${classification ? `
          <span class="font-bold text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/[0.04]" style="color: ${color}">
            ${classification}
          </span>
        ` : ''}
      </div>
      <div class="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px] text-[#8A8A85] pt-0.5">
        <div><span class="text-[#5A5A57]">Eval:</span> <span class="font-bold text-[#C9A356]">${score}</span></div>
        <div><span class="text-[#5A5A57]">CPL:</span> <span class="font-bold text-[#EDEAE3]">${cpl}</span></div>
        <div><span class="text-[#5A5A57]">Accuracy:</span> <span class="font-bold text-[#EDEAE3]">${accuracy}</span></div>
        <div><span class="text-[#5A5A57]">Depth:</span> <span class="font-bold text-[#EDEAE3]">${depth}</span></div>
      </div>
    `;
  };

  // High-frequency mouse scrub handler using requestAnimationFrame
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;

    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
    }

    rafId.current = requestAnimationFrame(() => {
      // Find closest move point index
      let closestPt = points[0];
      let minDiff = Math.abs(points[0].x - (clientX / rect.width) * calculatedWidth);
      
      for (let i = 1; i < points.length; i++) {
        const diff = Math.abs(points[i].x - (clientX / rect.width) * calculatedWidth);
        if (diff < minDiff) {
          minDiff = diff;
          closestPt = points[i];
        }
      }

      // Position guideline directly via DOM
      if (guidelineRef.current) {
        guidelineRef.current.setAttribute('x1', String(closestPt.x));
        guidelineRef.current.setAttribute('x2', String(closestPt.x));
        guidelineRef.current.style.display = 'block';
      }

      // Position glowing hover circle directly via DOM
      if (hoverDotRef.current) {
        const color = getClassificationColor(closestPt.classification) || '#C9A356';
        hoverDotRef.current.setAttribute('cx', String(closestPt.x));
        hoverDotRef.current.setAttribute('cy', String(closestPt.y));
        hoverDotRef.current.setAttribute('fill', color);
        hoverDotRef.current.style.display = 'block';
      }

      // Position tooltip directly via DOM
      if (tooltipRef.current) {
        const tooltipX = (closestPt.x / calculatedWidth) * 100;
        const tooltipY = (closestPt.y / height) * 100;
        tooltipRef.current.style.left = `${tooltipX}%`;
        tooltipRef.current.style.top = `${tooltipY}%`;
        tooltipRef.current.style.display = 'flex';
        updateTooltipDOM(closestPt);
      }

      // Trigger board preview state update in App.tsx
      if (onHoverMove) {
        onHoverMove(closestPt.idx);
      }
    });
  };

  const handleMouseLeave = () => {
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
    }
    
    // Hide guideline, dot, and tooltip directly via DOM
    if (guidelineRef.current) guidelineRef.current.style.display = 'none';
    if (hoverDotRef.current) hoverDotRef.current.style.display = 'none';
    if (tooltipRef.current) tooltipRef.current.style.display = 'none';

    if (onHoverMove) {
      onHoverMove(null);
    }
  };

  const handleClick = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    
    let closestPt = points[0];
    let minDiff = Math.abs(points[0].x - (clientX / rect.width) * calculatedWidth);
    
    for (let i = 1; i < points.length; i++) {
      const diff = Math.abs(points[i].x - (clientX / rect.width) * calculatedWidth);
      if (diff < minDiff) {
        minDiff = diff;
        closestPt = points[i];
      }
    }

    onSelectMove(closestPt.idx);
  };

  return (
    <div className="w-full antique-panel rounded-xl p-4 flex flex-col items-center relative select-none">
      {/* Centered White Label */}
      <div className="flex flex-col items-center text-[10px] font-semibold uppercase tracking-widest text-[#8A8A85] font-mono mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] leading-none text-[#EDEAE3]/70">♔</span> White
        </div>
        <span className="text-[7px] text-[#C9A356]/65 leading-none mt-0.5">▲</span>
      </div>

      <div className="w-full overflow-x-auto custom-scrollbar">
        <div style={{ minWidth: '100%', width: `${calculatedWidth}px`, height: `${height}px` }} className="relative">
          <svg
            ref={containerRef}
            viewBox={`0 0 ${calculatedWidth} ${height}`}
            preserveAspectRatio="none"
            className="w-full h-full cursor-pointer overflow-visible"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onClick={handleClick}
          >
            <defs>
              <linearGradient id="goldGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(197, 160, 89, 0.18)" />
                <stop offset="50%" stopColor="rgba(197, 160, 89, 0.01)" />
                <stop offset="100%" stopColor="rgba(197, 160, 89, 0.18)" />
              </linearGradient>
            </defs>

            {/* Render the static layers containing spline paths, reference lines, and markers */}
            <StaticGraphLayer
              points={points}
              splinePath={splinePath}
              fillPath={fillPath}
              currentIndex={currentIndex}
              width={calculatedWidth}
              height={height}
              centerY={centerY}
            />

            {/* Interactive Guideline Layer (Manipulated directly via DOM refs) */}
            <line
              ref={guidelineRef}
              x1={0}
              y1={0}
              x2={0}
              y2={height}
              stroke="rgba(255, 255, 255, 0.15)"
              strokeWidth="1"
              strokeDasharray="3 3"
              style={{ display: 'none' }}
            />

            {/* Interactive Glowing Hover Dot (Manipulated directly via DOM refs) */}
            <circle
              ref={hoverDotRef}
              cx={0}
              y={0}
              r="4.5"
              stroke="#151517"
              strokeWidth="1.5"
              style={{ display: 'none' }}
            />
          </svg>

          {/* Premium Tooltip Overlay (Manipulated directly via DOM refs) */}
          <div 
            ref={tooltipRef}
            className="absolute z-30 bg-[#0F0F11]/95 border border-[#C9A356]/30 p-3 rounded-xl text-[10px] font-mono shadow-2xl pointer-events-none -translate-x-1/2 -translate-y-[105%] flex flex-col gap-1 backdrop-blur-md transition-all duration-150 animate-scale-up"
            style={{ display: 'none' }}
          />
        </div>
      </div>

      {/* Centered Black Label */}
      <div className="flex flex-col items-center text-[10px] font-semibold uppercase tracking-widest text-[#8A8A85] font-mono mt-2">
        <span className="text-[7px] text-[#C9A356]/65 leading-none mb-0.5">▼</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] leading-none text-[#EDEAE3]/50">♚</span> Black
        </div>
      </div>
    </div>
  );
};
export default EvaluationGraph;
