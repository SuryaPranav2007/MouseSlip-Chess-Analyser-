import React, { useEffect, useRef, useState } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight,
  BookOpen,
  Trophy,
  Activity,
  Award,
  ThumbsUp,
  Star,
  Check
} from 'lucide-react';

import type { CanonicalEval } from '../hooks/useWebSocket';
import { CLASSIFICATIONS } from '../constants/classifications';

export interface MoveItem {
  move_number: number;
  color: 'white' | 'black';
  san: string;
  uci: string;
  fen_before: string;
  fen_after: string;
  eval?: string;
  eval_canonical?: CanonicalEval;
  classification?: string;
  reasons?: string[];
  opening?: {
    eco: string;
    name: string;
    variation: string;
    status: string;
  };
}

export interface GameStats {
  accuracy: number;
  avg_cpl: number;
  brilliant: number;
  great: number;
  best: number;
  excellent: number;
  good: number;
  book: number;
  inaccuracy: number;
  mistake: number;
  blunder: number;
  missed_win: number;
}

export interface ReviewStats {
  white: GameStats;
  black: GameStats;
}

interface MoveListProps {
  moves: MoveItem[];
  currentIndex: number; // -1 for start, 0 for first move, etc.
  hoveredIndex?: number | null;
  onSelectMove: (index: number) => void;
  openingName: string;
  openingEco: string;
  openingVariation?: string;
  openingStatus?: string;
  stats: ReviewStats | null;
  terminalResult?: string | null;
  isGameLoaded?: boolean;
}

export const MoveList: React.FC<MoveListProps> = ({
  moves,
  currentIndex,
  hoveredIndex = null,
  onSelectMove,
  openingName,
  openingEco,
  openingVariation = '',
  openingStatus = 'Book',
  stats,
  terminalResult = null,
  isGameLoaded = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'moves' | 'review'>('moves');

  // Automatically switch to Review tab when stats are available
  useEffect(() => {
    if (stats) {
      setActiveTab('review');
    } else {
      setActiveTab('moves');
    }
  }, [stats]);

  // Group moves into pairs (rounds)
  const rounds: { roundNumber: number; white?: MoveItem; whiteIdx: number; black?: MoveItem; blackIdx: number }[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    const roundNumber = Math.floor(i / 2) + 1;
    rounds.push({
      roundNumber,
      white: moves[i],
      whiteIdx: i,
      black: moves[i + 1],
      blackIdx: i + 1
    });
  }

  // Scroll active move into view automatically — scoped to container only (no page scroll)
  useEffect(() => {
    if (!containerRef.current || activeTab !== 'moves') return;
    const activeElement = containerRef.current.querySelector('.active-move') as HTMLElement | null;
    if (activeElement) {
      const container = containerRef.current;
      const elementTop = activeElement.offsetTop - container.offsetTop;
      const elementBottom = elementTop + activeElement.offsetHeight;
      const containerScrollTop = container.scrollTop;
      const containerScrollBottom = containerScrollTop + container.clientHeight;

      if (elementTop < containerScrollTop) {
        // Element is above the visible area — scroll up
        container.scrollTop = elementTop - 8;
      } else if (elementBottom > containerScrollBottom) {
        // Element is below the visible area — scroll down
        container.scrollTop = elementBottom - container.clientHeight + 8;
      }
      // If already in view, do nothing — no jitter, no page scroll
    }
  }, [currentIndex, activeTab]);

  // Text color helper matching classifications
  const getClassificationTextColor = (cls?: string) => {
    if (!cls) return 'text-white/80';
    const config = CLASSIFICATIONS[cls.toLowerCase()];
    return config ? config.textColor : 'text-white/80';
  };

  // Render move classification badge
  const renderBadge = (cls?: string) => {
    if (!cls) return null;
    const config = CLASSIFICATIONS[cls.toLowerCase()];
    if (!config) return null;

    let content: React.ReactNode = config.badgeText;
    switch (cls.toLowerCase()) {
      case 'brilliant':
        content = <span className="font-black">!!</span>;
        break;
      case 'great':
        content = <span className="font-black">!</span>;
        break;
      case 'book':
        content = <BookOpen className="w-2.5 h-2.5 stroke-[3]" />;
        break;
      case 'best':
        content = <Star className="w-2.5 h-2.5 fill-current" />;
        break;
      case 'excellent':
        content = <ThumbsUp className="w-2.5 h-2.5 fill-current stroke-[1.5]" />;
        break;
      case 'good':
        content = <Check className="w-2.5 h-2.5 stroke-[3.5]" />;
        break;
      case 'inaccuracy':
        content = <span className="font-black">?!</span>;
        break;
      case 'mistake':
        content = <span className="font-black">?</span>;
        break;
      case 'miss':
        content = <span className="font-black text-[11px] leading-none">×</span>;
        break;
      case 'blunder':
        content = <span className="font-black">??</span>;
        break;
    }

    return (
      <span 
        className={`w-[18px] h-[18px] rounded-full flex items-center justify-center font-sans text-[9px] select-none shrink-0 ${config.bgColor} ${config.badgeText === '📖' || config.badgeText === '?!' ? 'text-black' : 'text-white'} ${config.glowColor}`}
        title={cls}
      >
        {content}
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full antique-panel rounded-xl overflow-hidden select-none">
      {/* Tab Switcher Headers */}
      <div className="flex bg-[#0F0F11] border-b border-[#C9A356]/10 p-1 text-xs">
        <button
          onClick={() => setActiveTab('moves')}
          className={`flex-1 py-2 rounded-md font-semibold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'moves' ? 'bg-[#1C1C1F] text-[#C9A356] shadow' : 'text-[#8A8A85] hover:text-[#EDEAE3]'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          Moves List
        </button>
        <button
          onClick={() => {
            if (stats) setActiveTab('review');
          }}
          disabled={!stats}
          className={`flex-1 py-2 rounded-md font-semibold transition-all flex items-center justify-center gap-1.5 disabled:opacity-30 ${
            activeTab === 'review' ? 'bg-[#1C1C1F] text-[#C9A356] shadow' : 'text-[#8A8A85] hover:text-[#EDEAE3]'
          }`}
        >
          <Award className="w-3.5 h-3.5" />
          Game Review
        </button>
      </div>

      {activeTab === 'moves' ? (
        <>
          {/* Dedicated Fixed-Height Opening Display — only shown once moves exist */}
          {moves.length > 0 && (
            <div className="mx-3.5 mt-3.5 mb-2 px-5 py-3 bg-[#1E1E1E] border border-[#c5a059]/15 rounded-xl flex flex-col justify-center select-none shadow-md" style={{ minHeight: '76px' }}>
              {openingName ? (
                <div className="flex flex-col">
                  <div className="text-[9px] font-mono font-black uppercase tracking-widest text-[#c5a059] flex items-center gap-1.5 leading-none">
                    {openingEco && <span>[{openingEco}]</span>}
                    {openingEco && <span className="opacity-40">•</span>}
                    <span>
                      {openingStatus === 'Unavailable' 
                        ? 'FEN Analysis' 
                        : (openingStatus === 'Out of Book' ? 'Theory Ended' : 'Opening Book')}
                    </span>
                  </div>
                  <div className="mt-1 text-xs font-black text-white leading-tight truncate" title={openingName}>
                    {openingName}
                  </div>
                  {openingVariation ? (
                    <div className="text-[10px] font-bold text-white/50 mt-0.5 leading-tight truncate" title={openingVariation}>
                      {openingVariation}
                    </div>
                  ) : (
                    <div className="text-[10px] text-transparent select-none leading-tight mt-0.5">•</div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col">
                  <div className="text-[9px] font-mono font-black uppercase tracking-widest text-white/20 leading-none">
                    —
                  </div>
                  <div className="mt-1 text-xs font-bold text-white/30 italic leading-none">
                    Analyzing opening…
                  </div>
                  <div className="text-[10px] text-transparent select-none leading-tight mt-0.5">•</div>
                </div>
              )}
            </div>
          )}

          {/* Moves table headers */}
          <div className="grid grid-cols-12 px-5 py-2 bg-[#0A0A0C] border-b border-[#C9A356]/08 text-[9px] font-semibold uppercase tracking-wider text-[#5A5A57]">
            <div className="col-span-2">#</div>
            <div className="col-span-5 px-2">White</div>
            <div className="col-span-5 px-2">Black</div>
          </div>

          {/* Moves Container */}
          <div 
            ref={containerRef}
            className="flex-1 overflow-y-auto p-2 space-y-[2px] text-sm max-h-[640px] min-h-[500px] bg-[#0A0A0C] custom-scrollbar"
          >
            {rounds.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center font-sans py-24 px-4 space-y-3">
                {isGameLoaded ? (
                  <Check className="w-8 h-8 text-[#7A8471] animate-pulse" />
                ) : (
                  <Trophy className="w-8 h-8 text-[#3A3A3A]" />
                )}
                <div>
                  <p className="text-sm font-semibold text-[#5A5A57]">
                    {isGameLoaded ? 'Custom Position Loaded' : 'No moves recorded'}
                  </p>
                  <p className="text-[11px] text-[#3A3A3A] mt-1 max-w-[200px] leading-relaxed">
                    {isGameLoaded 
                      ? 'Analysis running. Make a move on the board to begin playing from this position.'
                      : 'Paste a FEN/PGN or import Chess.com games to begin analysis.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-[2px]">
                {rounds.map((round) => (
                  <div 
                    key={round.roundNumber} 
                    className="grid grid-cols-12 items-center py-1 px-3 rounded hover:bg-[#C9A356]/[0.025] even:bg-[#C9A356]/[0.01]"
                  >
                    {/* Round Number */}
                    <div className="col-span-2 text-[#5A5A57] font-semibold text-xs" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{round.roundNumber}.</div>
                    
                    {/* White Move */}
                    <div className="col-span-5 px-1 flex items-center">
                      {round.white && (
                        <button
                          onClick={() => onSelectMove(round.whiteIdx)}
                          className={`flex-1 text-left px-2.5 py-2 rounded-lg transition-all duration-150 font-bold flex items-center justify-between group ${
                            currentIndex === round.whiteIdx 
                              ? 'bg-[#C9A356]/12 border border-[#C9A356]/38 text-[#C9A356] active-move shadow-[0_0_12px_rgba(201,163,86,0.07)]' 
                              : hoveredIndex === round.whiteIdx
                              ? 'bg-[#C9A356]/06 border border-[#C9A356]/18 text-[#EDEAE3] shadow'
                              : 'text-[#8A8A85] hover:text-[#EDEAE3] hover:bg-white/[0.03] border border-transparent'
                          }`}
                          style={{ fontFamily: '"JetBrains Mono", monospace' }}
                        >
                          <span className={`truncate ${getClassificationTextColor(round.white.classification)}`}>
                            {round.white.san}
                          </span>
                          {renderBadge(round.white.classification)}
                        </button>
                      )}
                    </div>

                    {/* Black Move */}
                    <div className="col-span-5 px-1 flex items-center">
                      {round.black && (
                        <button
                          onClick={() => onSelectMove(round.blackIdx)}
                          className={`flex-1 text-left px-2.5 py-2 rounded-lg transition-all duration-150 font-bold flex items-center justify-between group ${
                            currentIndex === round.blackIdx 
                              ? 'bg-[#C9A356]/12 border border-[#C9A356]/38 text-[#C9A356] active-move shadow-[0_0_12px_rgba(201,163,86,0.07)]' 
                              : hoveredIndex === round.blackIdx
                              ? 'bg-[#C9A356]/06 border border-[#C9A356]/18 text-[#EDEAE3] shadow'
                              : 'text-[#8A8A85] hover:text-[#EDEAE3] hover:bg-white/[0.03] border border-transparent'
                          }`}
                          style={{ fontFamily: '"JetBrains Mono", monospace' }}
                        >
                          <span className={`truncate ${getClassificationTextColor(round.black.classification)}`}>
                            {round.black.san}
                          </span>
                          {renderBadge(round.black.classification)}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Selected Move Review Feedback Card */}
          {currentIndex >= 0 && moves[currentIndex] && moves[currentIndex].classification && (
            <div className="mx-4 mb-2.5 p-3 rounded-xl bg-[#0F0F11] border border-[#C9A356]/12 shadow-md flex items-start gap-3 select-none">
              {/* Badge */}
              <div className="mt-0.5">
                {renderBadge(moves[currentIndex].classification)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold uppercase tracking-wider ${getClassificationTextColor(moves[currentIndex].classification)}`}>
                    {moves[currentIndex].classification || 'Analysis'}
                  </span>
                  {moves[currentIndex].eval && (
                    <span className="text-[10px] text-[#C9A356] font-bold" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{moves[currentIndex].eval}</span>
                  )}
                </div>
                {/* Reasons / Explanation */}
                <p className="text-[11px] text-[#8A8A85] mt-1 leading-normal font-sans">
                  {(() => {
                    const m = moves[currentIndex];
                    const reasons = m.reasons || [];
                    if (reasons.length > 0) {
                      return reasons.join("; ");
                    }
                    switch (m.classification?.toLowerCase()) {
                      case 'brilliant': return 'A spectacular sacrifice that improves your position.';
                      case 'great': return 'An excellent move that is hard to find.';
                      case 'best': return 'The best move in the position.';
                      case 'excellent': return 'A strong move that keeps the advantage.';
                      case 'good': return 'A decent move, but not the best option.';
                      case 'book': return 'A standard opening theory move.';
                      case 'inaccuracy': return 'A small mistake that slightly weakens your position.';
                      case 'mistake': return 'A bad move that compromises your position.';
                      case 'blunder': return 'A critical blunder that throws away the game.';
                      case 'miss': return 'An overlooked chance to capture material or checkmate.';
                      default: return 'No explanation available.';
                    }
                  })()}
                </p>
              </div>
            </div>
          )}

          {/* Navigation Buttons footer */}
          <div className="p-3 bg-[#0F0F11] border-t border-[#C9A356]/08 grid grid-cols-4 gap-2">
            <button
              onClick={() => onSelectMove(-1)}
              disabled={currentIndex === -1}
              className="flex items-center justify-center p-3 rounded-lg btn-secondary disabled:opacity-20 disabled:hover:bg-transparent transition-all active:scale-[0.97] h-11 text-[#8A8A85]"
              title="First Move"
            >
              <ChevronsLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => onSelectMove(currentIndex - 1)}
              disabled={currentIndex === -1}
              className="flex items-center justify-center p-3 rounded-lg btn-secondary disabled:opacity-20 disabled:hover:bg-transparent transition-all active:scale-[0.97] h-11 text-[#8A8A85]"
              title="Previous Move"
            >
              <ChevronLeft className="w-5 h-5 text-white/80" />
            </button>
            <button
              onClick={() => onSelectMove(currentIndex + 1)}
              disabled={currentIndex === moves.length - 1 || moves.length === 0}
              className="flex items-center justify-center p-3 rounded-lg btn-secondary disabled:opacity-20 disabled:hover:bg-transparent transition-all active:scale-[0.97] h-11 text-[#8A8A85]"
              title="Next Move"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => onSelectMove(moves.length - 1)}
              disabled={currentIndex === moves.length - 1 || moves.length === 0}
              className="flex items-center justify-center p-3 rounded-lg btn-secondary disabled:opacity-20 disabled:hover:bg-transparent transition-all active:scale-[0.97] h-11 text-[#8A8A85]"
              title="Last Move"
            >
              <ChevronsRight className="w-5 h-5" />
            </button>
          </div>
        </>
      ) : (
        /* Game Review Tab */
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#0A0A0C] custom-scrollbar">
          {/* Accuracy Row */}
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="bg-[#0F0F11] p-3.5 rounded-lg border border-[#C9A356]/10 flex flex-col items-center justify-center shadow-lg relative overflow-hidden">
              <p className="text-[9px] font-semibold text-[#5A5A57] uppercase tracking-widest leading-none">White Accuracy</p>
              <p className="text-2xl font-bold text-[#7A8471] mt-2 leading-none" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{stats?.white.accuracy}%</p>
              <div className="h-[2px] bg-[#1C1C1F] rounded-full w-full mt-3 overflow-hidden">
                <div className="bg-[#7A8471] h-full" style={{ width: `${stats?.white.accuracy}%` }} />
              </div>
              <p className="text-[10px] text-[#5A5A57] mt-2">CPL: <span className="font-bold text-[#8A8A85]" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{stats?.white.avg_cpl}</span></p>
            </div>
            <div className="bg-[#0F0F11] p-3.5 rounded-lg border border-[#C9A356]/10 flex flex-col items-center justify-center shadow-lg relative overflow-hidden">
              <p className="text-[9px] font-semibold text-[#5A5A57] uppercase tracking-widest leading-none">Black Accuracy</p>
              <p className="text-2xl font-bold text-[#7A8471] mt-2 leading-none" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{stats?.black.accuracy}%</p>
              <div className="h-[2px] bg-[#1C1C1F] rounded-full w-full mt-3 overflow-hidden">
                <div className="bg-[#7A8471] h-full" style={{ width: `${stats?.black.accuracy}%` }} />
              </div>
              <p className="text-[10px] text-white/40 font-mono mt-2">CPL: <span className="font-bold text-white/60">{stats?.black.avg_cpl}</span></p>
            </div>
          </div>

          {/* Game Result Banner (Phase 4) */}
          {terminalResult && (
            <div className="bg-[#1E1E1E] border border-[#c5a059]/20 p-3 rounded-lg flex items-center justify-between shadow-md">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="w-8 h-8 rounded-lg bg-[#c5a059]/10 flex items-center justify-center shrink-0">
                  <Trophy className="w-4 h-4 text-[#c5a059]" />
                </div>
                <div className="overflow-hidden">
                  <p className="text-[9px] font-extrabold text-[#c5a059]/80 uppercase tracking-widest leading-none">Game Result</p>
                  <p className="text-xs font-bold text-white mt-1.5 truncate leading-none">
                    {terminalResult.toLowerCase().includes("checkmate")
                      ? `Checkmate • ${terminalResult.toLowerCase().includes("white wins") ? "White Wins" : "Black Wins"}`
                      : terminalResult
                    }
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Opening Detail Card */}
          <div className="bg-[#1E1E1E] border border-white/5 p-3 rounded-lg flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-chessGreen/10 flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4 text-chessGreen" />
            </div>
            <div className="overflow-hidden">
              <p className="text-[9px] font-extrabold text-white/35 uppercase tracking-widest">Opening Played</p>
              <p className="text-xs font-bold text-white truncate mt-0.5">{openingEco ? `${openingEco}: ` : ''}{openingName || "Custom Position"}</p>
            </div>
          </div>

          {/* Classification Stats Breakdown */}
          <div className="bg-[#1E1E1E] border border-white/5 rounded-lg p-3.5 space-y-2.5">
            <div className="flex justify-between items-center text-[10px] font-extrabold text-white/30 uppercase tracking-wider pb-1 border-b border-white/5">
              <span>Classifications</span>
              <div className="flex gap-6 font-mono">
                <span>W</span>
                <span>B</span>
              </div>
            </div>

            {/* List items */}
            <div className="space-y-2 text-xs font-bold text-white/80">
              {Object.entries(CLASSIFICATIONS).map(([key, item]) => {
                const wCount = (stats?.white as any)?.[key] || 0;
                const bCount = (stats?.black as any)?.[key] || 0;

                let content: React.ReactNode = item.badgeText;
                if (key === 'book') {
                  content = <BookOpen className="w-2.5 h-2.5 stroke-[3]" />;
                } else if (key === 'best') {
                  content = <Star className="w-2.5 h-2.5 fill-current" />;
                } else if (key === 'excellent') {
                  content = <ThumbsUp className="w-2.5 h-2.5 fill-current stroke-[1.5]" />;
                } else if (key === 'good') {
                  content = <Check className="w-2.5 h-2.5 stroke-[3.5]" />;
                }

                return (
                  <div key={key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className={`w-[18px] h-[18px] rounded-full flex items-center justify-center font-sans text-[9px] select-none shrink-0 ${item.bgColor} ${item.badgeText === '📖' || item.badgeText === '?!' ? 'text-black' : 'text-white'} ${item.glowColor}`}>
                        {content}
                      </span>
                      <span className="text-white/60 text-[11px]">{item.name}</span>
                    </div>
                    <div className="flex gap-6 font-mono text-[11px]">
                      <span className="w-3 text-center">{wCount}</span>
                      <span className="w-3 text-center">{bCount}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default MoveList;
