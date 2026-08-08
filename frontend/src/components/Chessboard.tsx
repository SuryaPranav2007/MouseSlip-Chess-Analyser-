import React, { useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Key } from 'chessground/types';
import { ThumbsUp, Star, Check, BookOpen } from 'lucide-react';
import { EvaluationBar } from './EvaluationBar';
import type { CanonicalEval } from '../hooks/useWebSocket';
import { CLASSIFICATIONS } from '../constants/classifications';

interface ChessboardProps {
  fen: string;
  orientation: 'white' | 'black';
  bestMove: string | null;
  secondBestMove?: string | null;
  pv: string[];
  lastMove: [string, string] | null;
  turnColor: 'white' | 'black';
  onMove: (from: string, to: string) => void;
  legalDests: Map<string, string[]>;
  readOnly?: boolean;
  onManualMoveAttempt?: () => void;
  scoreCanonical?: CanonicalEval | null;
  classification?: string | null;
  classificationUci?: string | null;
  /** Called whenever the board's pixel size changes, e.g. on resize. */
  onBoardSizeChange?: (size: number) => void;
  /** Ref to an imperative snap function. Call snapBoard() to reset Chessground to the current FEN. */
  snapBoardRef?: React.MutableRefObject<(() => void) | null>;
}

export const Chessboard: React.FC<ChessboardProps> = ({
  fen,
  orientation,
  bestMove,
  secondBestMove,
  pv,
  lastMove,
  turnColor,
  onMove,
  legalDests,
  readOnly = false,
  onManualMoveAttempt,
  scoreCanonical = null,
  classification = null,
  classificationUci = null,
  onBoardSizeChange,
  snapBoardRef,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const [boardSize, setBoardSize] = useState<number>(560);
  const cgRef = useRef<Api | null>(null);

  // Expose snap function so parent can imperatively reset Chessground to current FEN
  useEffect(() => {
    if (snapBoardRef) {
      snapBoardRef.current = () => {
        if (cgRef.current) {
          cgRef.current.set({ fen });
          cgRef.current.redrawAll();
        }
      };
    }
  }, [snapBoardRef, fen]);

  // Keep references to latest callbacks to prevent stale closures
  const onMoveRef = useRef(onMove);
  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);

  // Debug log for every analysis update
  useEffect(() => {
    try {
      const getMoveSan = (uci: string | null) => {
        if (!uci || uci.length < 4) return null;
        const tempChess = new Chess(fen);
        const from = uci.slice(0, 2);
        const to = uci.slice(2, 4);
        const promo = uci.length > 4 ? uci[4] : undefined;
        const move = tempChess.move({ from, to, promotion: promo });
        return move ? move.san : null;
      };
      
      const bestMoveUCI = bestMove || (pv && pv.length > 0 ? pv[0] : null);
      const secondMoveUCI = secondBestMove || null;
      
      console.log('[DEBUG_ARROWS_UPDATE] Analysis update received:', {
        bestMoveUCI,
        bestMoveSAN: getMoveSan(bestMoveUCI),
        secondMoveUCI,
        secondMoveSAN: getMoveSan(secondMoveUCI)
      });
    } catch (err) {
      console.warn('[DEBUG_ARROWS_UPDATE] Error logging moves:', err);
    }
  }, [fen, bestMove, secondBestMove, pv]);

  // Initialize Chessground
  useEffect(() => {
    if (!containerRef.current) return;

    const dests = legalDests as Map<Key, Key[]>;

    let isKingInCheck = false;
    let isTerminal = false;
    try {
      const tempChess = new Chess(fen);
      isTerminal = tempChess.isGameOver();
      isKingInCheck = tempChess.inCheck();
    } catch (e) {
      console.error('Error parsing FEN on Chessground mount:', e);
    }

    const isReadOnlyMode = readOnly || isTerminal;

    const config = {
      fen,
      orientation,
      turnColor,
      coordinates: true,
      animation: {
        enabled: true,
        duration: 200,
      },
      movable: isReadOnlyMode ? {
        free: false,
        color: undefined,
        dests: undefined,
      } : {
        free: false,
        color: turnColor,
        dests,
        events: {
          after: (orig: Key, dest: Key) => {
            if (orig === dest) return;
            onMoveRef.current(orig, dest);
          },
        },
      },
      lastMove: lastMove ? (lastMove as Key[]) : undefined,
      highlight: {
        lastMove: true,
        check: true,
      },
      check: isKingInCheck,
      drawable: {
        enabled: true,
        visible: true,
        eraseOnClick: true,
      }
    };

    const cg = Chessground(containerRef.current, config);
    cgRef.current = cg;

    return () => {
      if (cgRef.current) {
        cgRef.current.destroy();
      }
    };
  }, []); // Run once on mount

  // Sync state changes with Chessground api
  useEffect(() => {
    const cg = cgRef.current;
    if (!cg) return;

    const dests = legalDests as Map<Key, Key[]>;

    let isKingInCheck = false;
    let isTerminal = false;
    try {
      const tempChess = new Chess(fen);
      isTerminal = tempChess.isGameOver();
      isKingInCheck = tempChess.inCheck();
    } catch (e) {
      console.error('Error parsing FEN on Chessground sync:', e);
    }

    const isReadOnlyMode = readOnly || isTerminal;

    console.log('[FRONTEND] Board interaction enabled for color:', isReadOnlyMode ? 'none' : turnColor, 'FEN:', fen);

    cg.set({
      fen,
      orientation,
      turnColor,
      movable: isReadOnlyMode ? {
        color: undefined,
        dests: undefined,
      } : {
        color: turnColor,
        dests,
        events: {
          after: (orig: Key, dest: Key) => {
            if (orig === dest) return;
            console.log('[FRONTEND] Chessground piece moved visually, dispatching onMove asynchronously');
            setTimeout(() => {
              onMoveRef.current(orig, dest);
            }, 0);
          },
        },
      },
      lastMove: lastMove ? (lastMove as Key[]) : undefined,
      check: isKingInCheck,
    });

    requestAnimationFrame(() => {
      if (cgRef.current) {
        cgRef.current.redrawAll();
      }
    });
  }, [fen, turnColor, legalDests, lastMove, orientation, readOnly]);

  // Sync best move recommendation arrows
  useEffect(() => {
    const cg = cgRef.current;
    if (!cg) return;

    cg.set({
      drawable: {
        shapes: [],
        autoShapes: [], // Disable Chessground default segmented arrows
      },
    });
  }, [fen]);

  // ResizeObserver to calculate best board size divisible by 8
  useEffect(() => {
    const parent = parentRef.current;
    if (!parent) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const minDim = Math.min(width || 600, height || 600);
        // Force the size to be a multiple of 8
        const size = Math.max(240, Math.floor(minDim / 8) * 8);
        setBoardSize(size);
        onBoardSizeChange?.(size);
      }
    });

    resizeObserver.observe(parent);
    return () => {
      resizeObserver.disconnect();
    };
  }, [onBoardSizeChange]);

  // Redraw Chessground when board size changes
  useEffect(() => {
    if (cgRef.current) {
      cgRef.current.redrawAll();
    }
  }, [boardSize]);

  // Safety Net: observe the inner Chessground container to redraw when actual bounds change
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const resizeObserver = new ResizeObserver(() => {
      if (cgRef.current) {
        cgRef.current.redrawAll();
      }
    });

    resizeObserver.observe(el);
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const renderPremiumArrows = () => {
    const squareSize = boardSize / 8;
    const arrows: { from: string; to: string; color: 'green' | 'yellow' }[] = [];

    const best = bestMove || (pv && pv.length > 0 ? pv[0] : null);
    const hasBest = !!(best && best.length >= 4);
    const hasSecond = !!(secondBestMove && secondBestMove.length >= 4 && secondBestMove !== best);

    if (hasBest && best) {
      arrows.push({
        from: best.slice(0, 2),
        to: best.slice(2, 4),
        color: 'green'
      });
    }

    if (hasSecond && best && secondBestMove) {
      // Safety net: check that they are not identical moves (Case A)
      const sameFrom = best.slice(0, 2) === secondBestMove.slice(0, 2);
      const sameTo = best.slice(2, 4) === secondBestMove.slice(2, 4);
      if (!(sameFrom && sameTo)) {
        arrows.push({
          from: secondBestMove.slice(0, 2),
          to: secondBestMove.slice(2, 4),
          color: 'yellow'
        });
      }
    }

    const shareFrom = !!(hasBest && hasSecond && best && secondBestMove && best.slice(0, 2) === secondBestMove.slice(0, 2));
    const shareTo = !!(hasBest && hasSecond && best && secondBestMove && best.slice(2, 4) === secondBestMove.slice(2, 4));

    return arrows.map((arrow) => {
      const getCoords = (sq: string) => {
        const file = sq.charCodeAt(0) - 97;
        const rank = parseInt(sq.charAt(1)) - 1;
        let x = 0;
        let y = 0;
        if (orientation === 'white') {
          x = (file + 0.5) * squareSize;
          y = (7 - rank + 0.5) * squareSize;
        } else {
          x = (7 - file + 0.5) * squareSize;
          y = (rank + 0.5) * squareSize;
        }
        return { x, y };
      };

      const start = getCoords(arrow.from);
      const end = getCoords(arrow.to);

      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const L = Math.sqrt(dx * dx + dy * dy);

      if (L === 0) return null;

      const ux = dx / L;
      const uy = dy / L;
      const px = -uy;
      const py = ux;

      let shiftedStartX = start.x;
      let shiftedStartY = start.y;
      let shiftedEndX = end.x;
      let shiftedEndY = end.y;

      if (shareFrom) {
        // Offset both start and end perpendicular to the arrow direction
        const shiftSign = arrow.color === 'green' ? 1 : -1;
        const shiftAmt = squareSize * 0.12;
        shiftedStartX += px * shiftSign * shiftAmt;
        shiftedStartY += py * shiftSign * shiftAmt;
        shiftedEndX += px * shiftSign * shiftAmt;
        shiftedEndY += py * shiftSign * shiftAmt;
      } else if (shareTo) {
        // Offset both start and end perpendicular to the arrow direction so arrowheads don't collide
        const shiftSign = arrow.color === 'green' ? 1 : -1;
        const shiftAmt = squareSize * 0.14;
        shiftedStartX += px * shiftSign * shiftAmt;
        shiftedStartY += py * shiftSign * shiftAmt;
        shiftedEndX += px * shiftSign * shiftAmt;
        shiftedEndY += py * shiftSign * shiftAmt;
      }

      // Offsets to avoid overlapping piece centers directly
      const offsetStart = squareSize * 0.28;
      const offsetEnd = squareSize * 0.32;
      
      const ax = shiftedStartX + offsetStart * ux;
      const ay = shiftedStartY + offsetStart * uy;
      const bx = shiftedEndX - offsetEnd * ux;
      const by = shiftedEndY - offsetEnd * uy;

      const LPrime = L - offsetStart - offsetEnd;
      if (LPrime <= 0) return null;

      // Shaft and head dimensions (increased by 33%)
      const wShaft = squareSize * 0.16;
      const wHead = squareSize * 0.40;
      const lHead = Math.min(squareSize * 0.40, LPrime * 0.6); // Scale head length for short moves

      // Base of the arrowhead
      const baseX = bx - lHead * ux;
      const baseY = by - lHead * uy;

      // Corners of the arrowhead
      const headLeftX = baseX + (wHead / 2) * px;
      const headLeftY = baseY + (wHead / 2) * py;
      const headRightX = baseX - (wHead / 2) * px;
      const headRightY = baseY - (wHead / 2) * py;

      // Fill colors matching our premium theme (Vibrant green and yellow)
      const fillColors = {
        green: '#22c55e',
        yellow: '#ffd600'
      };

      const colorVal = fillColors[arrow.color];

      return (
        <g 
          key={`${arrow.from}-${arrow.to}-${arrow.color}`}
          className="animate-arrow-fade"
        >
          {/* Shaft Background Black Outline */}
          <line
            x1={ax}
            y1={ay}
            x2={baseX}
            y2={baseY}
            stroke="#000000"
            strokeWidth={wShaft + 2.5}
            strokeLinecap="round"
          />
          {/* Shaft Colored Line */}
          <line
            x1={ax}
            y1={ay}
            x2={baseX}
            y2={baseY}
            stroke={colorVal}
            strokeWidth={wShaft}
            strokeLinecap="round"
          />
          {/* Arrow Head Background Black Outline */}
          <polygon
            points={`${bx},${by} ${headLeftX},${headLeftY} ${headRightX},${headRightY}`}
            fill="#000000"
            stroke="#000000"
            strokeWidth={wShaft * 0.4 + 3.0}
            strokeLinejoin="round"
          />
          {/* Arrow Head Colored Triangle */}
          <polygon
            points={`${bx},${by} ${headLeftX},${headLeftY} ${headRightX},${headRightY}`}
            fill={colorVal}
            stroke={colorVal}
            strokeWidth={wShaft * 0.4}
            strokeLinejoin="round"
          />
        </g>
      );
    });
  };

  const renderDestinationSquareBadge = () => {
    if (!classification || !classificationUci) return null;
    const destSq = classificationUci.slice(2, 4);
    if (destSq.length !== 2) return null;

    const file = destSq.charCodeAt(0) - 97;
    const rank = parseInt(destSq.charAt(1)) - 1;
    const squareSize = boardSize / 8;
    const badgeSize = squareSize * 0.32;

    let left = 0;
    let top = 0;

    if (orientation === 'white') {
      left = (file + 1) * squareSize - badgeSize - 2;
      top = (7 - rank) * squareSize + 2;
    } else {
      left = (7 - file + 1) * squareSize - badgeSize - 2;
      top = rank * squareSize + 2;
    }

    const cls = classification.toLowerCase();
    const config = CLASSIFICATIONS[cls];
    if (!config) return null;

    let bg = config.bgColor;
    let text = config.badgeText === '📖' || config.badgeText === '?!' ? 'text-black' : 'text-white';
    let content: React.ReactNode = config.badgeText;
    let shadow = config.glowColor;

    switch (cls) {
      case 'brilliant':
        content = '!!';
        break;
      case 'great':
        content = '!';
        break;
      case 'book':
        content = <BookOpen style={{ width: `${badgeSize * 0.55}px`, height: `${badgeSize * 0.55}px` }} className="stroke-[3]" />;
        break;
      case 'best':
        content = <Star style={{ width: `${badgeSize * 0.55}px`, height: `${badgeSize * 0.55}px` }} className="fill-current" />;
        break;
      case 'excellent':
        content = <ThumbsUp style={{ width: `${badgeSize * 0.52}px`, height: `${badgeSize * 0.52}px` }} className="fill-current stroke-[1.5]" />;
        break;
      case 'good':
        content = <Check style={{ width: `${badgeSize * 0.6}px`, height: `${badgeSize * 0.6}px` }} className="stroke-[3.5]" />;
        break;
      case 'inaccuracy':
        content = '?!';
        break;
      case 'mistake':
        content = '?';
        break;
      case 'miss':
        content = <span style={{ fontSize: `${badgeSize * 0.7}px` }} className="font-sans font-black leading-none">×</span>;
        break;
      case 'blunder':
        content = '??';
        break;
      default:
        return null;
    }

    return (
      <div
        key={`${classificationUci}-${classification}`}
        className={`absolute flex items-center justify-center rounded-full font-sans font-black select-none pointer-events-none z-30 transition-all duration-200 ${bg} ${text} ${shadow}`}
        style={{
          left: `${left}px`,
          top: `${top}px`,
          width: `${badgeSize}px`,
          height: `${badgeSize}px`,
          fontSize: `${badgeSize * 0.55}px`,
          transform: 'scale(1)',
          animation: 'badgePop 0.22s cubic-bezier(0.175, 0.885, 0.32, 1.275) both'
        }}
      >
        {content}
      </div>
    );
  };

  return (
    <div 
      ref={parentRef}
      className="relative w-full aspect-square max-w-[620px] mx-auto flex items-center justify-center"
      onMouseDown={() => {
        if (cgRef.current) {
          cgRef.current.redrawAll();
        }
        if (readOnly && onManualMoveAttempt) {
          onManualMoveAttempt();
        }
      }}
    >
      <div 
        className="relative flex flex-row items-stretch select-none"
        style={{ width: `${boardSize}px`, height: `${boardSize}px` }}
      >
        <div className="absolute right-full top-0 bottom-0 mr-2.5 shadow-[0_0_15px_rgba(197,160,89,0.07)]">
          <EvaluationBar 
            scoreCanonical={scoreCanonical} 
            orientation={orientation}
            isCheckmate={new Chess(fen).isCheckmate()}
            turnColor={turnColor}
          />
        </div>
        <div 
          ref={containerRef} 
          className="w-full h-full cg-wrap rounded-xl"
        />

        {/* Custom Premium continuous SVG Arrows Overlay */}
        <svg 
          className="absolute inset-0 w-full h-full pointer-events-none z-20"
          style={{ width: `${boardSize}px`, height: `${boardSize}px` }}
        >
          {renderPremiumArrows()}
        </svg>

        {/* Piece Classification Badge overlay */}
        {renderDestinationSquareBadge()}
      </div>
    </div>
  );
};
export default Chessboard;
