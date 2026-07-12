import React, { useState, useCallback } from 'react';
import { 
  Upload, 
  RefreshCw, 
  RotateCw, 
  Settings as SettingsIcon,
  Search,
  User,
  Activity,
  ChevronRight,
  Copy,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getApiUrl } from '../config';




const CopyButton: React.FC<{ label: string; getValue: () => string }> = ({ label, getValue }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(getValue());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  }, [getValue]);
  return (
    <button
      onClick={handleCopy}
      className="flex-1 h-9 px-2 rounded-lg btn-secondary text-[#8A8A85] hover:text-[#C9A356] transition-all flex items-center justify-center gap-1.5 text-xs font-semibold shadow-sm"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-[#7A8471]" /> : <Copy className="w-3.5 h-3.5" />}
      <span className={copied ? 'text-[#7A8471]' : ''}>{copied ? 'Copied!' : label}</span>
    </button>
  );
};

interface ControlPanelProps {
  onLoadPgn: (pgn: string) => void;
  onLoadFen: (fen: string) => void;
  onLoadChessComGame: (pgn: string) => void;
  onResetBoard: () => void;
  onFlipBoard: () => void;
  onReviewGame: () => void;
  isGameLoaded: boolean;
  isReviewing: boolean;
  reviewProgress: number; // 0 to 100
  settings: { depth: number; soundVolume: number; soundMuted: boolean; showSecondBestMove: boolean };
  onUpdateSettings: (settings: { depth: number; soundVolume: number; soundMuted: boolean; showSecondBestMove: boolean }) => void;
  pv: string[];
  fen: string;
  pgn: string;
  onPlayPvMove: (uci: string, index: number) => void;
  liveDepth?: number;
  liveNps?: number;
  engineStatus?: 'Idle' | 'Starting' | 'Searching' | 'Cancelling' | 'Completed' | 'Error';
  isConnected?: boolean;
  activeTab?: 'pgn' | 'fen' | 'chesscom';
  setActiveTab?: (tab: 'pgn' | 'fen' | 'chesscom') => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  onLoadPgn,
  onLoadFen,
  onLoadChessComGame,
  onResetBoard,
  onFlipBoard,
  onReviewGame,
  isGameLoaded,
  isReviewing,
  reviewProgress,
  settings,
  onUpdateSettings,
  pv: _pv,
  fen,
  pgn,
  onPlayPvMove: _onPlayPvMove,
  liveDepth = 0,
  liveNps = 0,
  engineStatus = 'Idle',
  isConnected = true,
  activeTab: activeTabProp,
  setActiveTab: setActiveTabProp
}) => {
  const [internalActiveTab, setInternalActiveTab] = useState<'pgn' | 'fen' | 'chesscom'>('pgn');
  const activeTab = activeTabProp !== undefined ? activeTabProp : internalActiveTab;
  const setActiveTab = setActiveTabProp !== undefined ? setActiveTabProp : setInternalActiveTab;
  const [pgnInput, setPgnInput] = useState('');
  const [fenInput, setFenInput] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [chessComGames, setChessComGames] = useState<any[]>([]);
  const [isLoadingGames, setIsLoadingGames] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  // Handle Chess.com fetch
  const handleFetchChessCom = async () => {
    if (!usernameInput.trim()) return;
    setIsLoadingGames(true);
    setErrorMsg('');
    setChessComGames([]);
    
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/chess-com/games?username=${encodeURIComponent(usernameInput)}`);
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Failed to fetch games.');
      }
      
      const data = await res.json();
      setChessComGames(data.games || []);
      if (data.games.length === 0) {
        setErrorMsg('No recent games found.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error connecting to server.');
    } finally {
      setIsLoadingGames(false);
    }
  };

  const handlePgnSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pgnInput.trim()) {
      onLoadPgn(pgnInput);
    }
  };

  const handleFenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (fenInput.trim()) {
      onLoadFen(fenInput);
    }
  };

  return (
    <div className="flex flex-col h-full antique-panel rounded-xl p-4 space-y-4 overflow-y-auto max-h-[85vh] select-none custom-scrollbar">
      
      {/* Controls Grid */}
      <div className="grid grid-cols-1 gap-2 pb-3.5 border-b border-[#C9A356]/10">
        <div className="flex gap-2">
          <button 
            onClick={onFlipBoard}
            className="flex-1 h-10 px-3 rounded-lg btn-secondary flex items-center justify-center gap-2 text-xs font-semibold transition-all active:scale-[0.98]"
            title="Rotate Board"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Rotate Board</span>
          </button>
          <button 
            onClick={() => {
              onResetBoard();
              setActiveTab('pgn');
              setPgnInput('');
              setFenInput('');
              setUsernameInput('');
              setChessComGames([]);
              setErrorMsg('');
              setIsLoadingGames(false);
            }}
            className="flex-1 h-10 px-3 rounded-lg btn-secondary flex items-center justify-center gap-2 text-xs font-semibold transition-all active:scale-[0.98]"
            title="Reset Board"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset Board</span>
          </button>
        </div>

        {/* Copy FEN / Copy PGN */}
        <div className="flex gap-2">
          <CopyButton label="Copy FEN" getValue={() => fen} />
          <CopyButton label="Copy PGN" getValue={() => pgn} />
        </div>

        <button 
          onClick={() => setShowSettings(!showSettings)}
          className={`w-full h-10 px-3 rounded-lg transition-all flex items-center justify-center gap-2 text-xs font-semibold border ${
            showSettings 
              ? 'bg-[#C9A356]/12 border-[#C9A356]/35 text-[#C9A356]' 
              : 'btn-secondary'
          }`}
          title="Settings"
        >
          <SettingsIcon className={`w-3.5 h-3.5 ${showSettings ? 'text-[#C9A356]' : ''}`} />
          <span>Settings</span>
        </button>
      </div>

      {/* Settings Panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-[#0F0F11] p-3 rounded-lg border border-[#C9A356]/12 overflow-y-auto max-h-[220px] text-xs space-y-2 custom-scrollbar"
          >
            <p className="font-bold text-[#C9A356] text-[10px] uppercase tracking-wider font-sans">Stockfish Engine Settings</p>
            <div className="flex items-center justify-between text-[#8A8A85]">
              <span>Target Analysis Depth:</span>
              <div className="flex items-center gap-2">
                <input 
                  type="range" 
                  min="10" 
                  max="22" 
                  value={settings.depth} 
                  onChange={(e) => onUpdateSettings({ ...settings, depth: parseInt(e.target.value) })}
                  className="w-24 h-1 bg-[#2A2A2E] rounded-lg appearance-none cursor-pointer accent-[#C9A356]"
                />
                <span className="font-bold text-[#C9A356] w-5 text-right" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{settings.depth}</span>
              </div>
            </div>

            <p className="font-bold text-[#C9A356] text-[10px] uppercase tracking-wider font-sans pt-2 border-t border-white/5">Audio Settings</p>
            <div className="flex items-center justify-between text-[#8A8A85]">
              <span>Mute Sounds:</span>
              <button
                onClick={() => onUpdateSettings({ ...settings, soundMuted: !settings.soundMuted })}
                className={`w-10 h-5 rounded-full p-0.5 transition-colors duration-200 focus:outline-none ${
                  settings.soundMuted ? 'bg-[#C9A356]' : 'bg-white/10'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                    settings.soundMuted ? 'transform translate-x-5' : ''
                  }`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between text-[#8A8A85]">
              <span>Sound Volume:</span>
              <div className="flex items-center gap-2">
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={Math.round(settings.soundVolume * 100)} 
                  onChange={(e) => onUpdateSettings({ ...settings, soundVolume: parseFloat(e.target.value) / 100 })}
                  className="w-24 h-1 bg-[#2A2A2E] rounded-lg appearance-none cursor-pointer accent-[#C9A356]"
                  disabled={settings.soundMuted}
                />
                <span className="font-bold text-[#C9A356] w-7 text-right" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                  {settings.soundMuted ? '0%' : `${Math.round(settings.soundVolume * 100)}%`}
                </span>
              </div>
            </div>

            <p className="font-bold text-[#C9A356] text-[10px] uppercase tracking-wider font-sans pt-2 border-t border-white/5">Visual Settings</p>
            <div className="flex items-center justify-between text-[#8A8A85]">
              <span>Show 2nd-Best Arrow (Yellow):</span>
              <button
                onClick={() => onUpdateSettings({ ...settings, showSecondBestMove: !settings.showSecondBestMove })}
                className={`w-10 h-5 rounded-full p-0.5 transition-colors duration-200 focus:outline-none ${
                  settings.showSecondBestMove ? 'bg-[#C9A356]' : 'bg-white/10'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                    settings.showSecondBestMove ? 'transform translate-x-5' : ''
                  }`}
                />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabs */}
      <div className="flex rounded-lg bg-[#0F0F11] p-1 border border-[#C9A356]/10 text-xs">
        <button
          onClick={() => setActiveTab('pgn')}
          className={`flex-1 py-2 rounded-md font-semibold transition-all duration-150 text-xs ${
            activeTab === 'pgn' ? 'bg-[#1C1C1F] text-[#C9A356] shadow' : 'text-[#8A8A85] hover:text-[#EDEAE3]'
          }`}
        >
          PGN
        </button>
        <button
          onClick={() => setActiveTab('fen')}
          className={`flex-1 py-2 rounded-md font-semibold transition-all duration-150 text-xs ${
            activeTab === 'fen' ? 'bg-[#1C1C1F] text-[#C9A356] shadow' : 'text-[#8A8A85] hover:text-[#EDEAE3]'
          }`}
        >
          FEN
        </button>
        <button
          onClick={() => setActiveTab('chesscom')}
          className={`flex-1 py-2 rounded-md font-semibold transition-all duration-150 text-xs ${
            activeTab === 'chesscom' ? 'bg-[#1C1C1F] text-[#C9A356] shadow' : 'text-[#8A8A85] hover:text-[#EDEAE3]'
          }`}
        >
          Chess.com
        </button>
      </div>

      {/* Import Content */}
      <div className="min-h-[160px] bg-[#0F0F11] border border-[#C9A356]/08 p-4 rounded-xl text-xs flex flex-col justify-center">
        {activeTab === 'pgn' && (
          <form onSubmit={handlePgnSubmit} className="space-y-3 w-full">
            <textarea
              placeholder="Paste PGN here (e.g. 1. e4 e5 2. Nf3...)"
              value={pgnInput}
              onChange={(e) => setPgnInput(e.target.value)}
              className="w-full h-24 bg-[#0A0A0C] text-[#EDEAE3] border border-[#C9A356]/12 rounded-lg p-3 focus:outline-none focus:border-[#C9A356]/50 focus:ring-1 focus:ring-[#C9A356]/30 font-mono text-[10.5px] resize-none transition-all duration-150 shadow-inner placeholder:text-[#5A5A57]"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}
            />
            <button
              type="submit"
              className="w-full h-10 btn-brass rounded-lg flex items-center justify-center gap-2 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>Load PGN</span>
            </button>
          </form>
        )}

        {activeTab === 'fen' && (
          <form onSubmit={handleFenSubmit} className="space-y-3 w-full">
            <input
              type="text"
              placeholder="Paste FEN here..."
              value={fenInput}
              onChange={(e) => setFenInput(e.target.value)}
              className="w-full h-10 bg-[#0A0A0C] text-[#EDEAE3] border border-[#C9A356]/12 rounded-lg px-3 focus:outline-none focus:border-[#C9A356]/50 focus:ring-1 focus:ring-[#C9A356]/30 font-mono text-[10.5px] transition-all duration-150 shadow-inner placeholder:text-[#5A5A57]"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}
            />
            <button
              type="submit"
              className="w-full h-10 btn-brass rounded-lg flex items-center justify-center gap-2 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>Load FEN</span>
            </button>
          </form>
        )}

        {activeTab === 'chesscom' && (
          <div className="space-y-3 w-full">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <User className="absolute left-3 top-3 w-3.5 h-3.5 text-[#5A5A57]" />
                <input
                  type="text"
                  placeholder="Username"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  className="w-full h-10 bg-[#0A0A0C] text-[#EDEAE3] border border-[#C9A356]/12 rounded-lg pl-9 pr-3 focus:outline-none focus:border-[#C9A356]/50 focus:ring-1 focus:ring-[#C9A356]/30 text-xs transition-all duration-150 shadow-inner placeholder:text-[#5A5A57]"
                />
              </div>
              <button
                onClick={handleFetchChessCom}
                disabled={isLoadingGames}
                className="w-10 h-10 flex items-center justify-center btn-secondary rounded-lg transition-colors disabled:opacity-40 cursor-pointer shrink-0"
              >
                {isLoadingGames ? (
                  <div className="w-3.5 h-3.5 border-2 border-[#8A8A85] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Search className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {errorMsg && <p className="text-[#8B3A3A] font-medium text-[10px]">{errorMsg}</p>}

            {chessComGames.length > 0 && (
              <div className="max-h-32 overflow-y-auto space-y-1.5 border-t border-[#C9A356]/08 pt-2 custom-scrollbar">
                {chessComGames.map((game, i) => (
                  <button
                    key={game.uuid || i}
                    onClick={() => onLoadChessComGame(game.pgn)}
                    className="w-full text-left p-2 rounded-lg hover:bg-[#C9A356]/06 bg-[#0A0A0C] border border-[#C9A356]/08 hover:border-[#C9A356]/22 flex items-center justify-between text-xs transition-all duration-150"
                  >
                    <div className="flex items-center gap-1.5 text-[#8A8A85] text-[10.5px] truncate pr-2 w-full">
                      {/* White Player Block */}
                      <span className="inline-flex items-center gap-1 max-w-[45%] shrink">
                        <span 
                          className="w-2 h-2 rounded-full bg-[#EDEAE3] border border-white/20 shrink-0" 
                          title="White" 
                        />
                        <span className="font-semibold text-[#EDEAE3] truncate">{game.white.username}</span>
                        {game.white.result === 'win' && (
                          <span 
                            className="w-1.5 h-1.5 rounded-full bg-[#7A8471] shrink-0" 
                            title="Winner" 
                          />
                        )}
                      </span>
                      
                      <span className="text-[#5A5A57] shrink-0">vs</span>
                      
                      {/* Black Player Block */}
                      <span className="inline-flex items-center gap-1 max-w-[45%] shrink">
                        <span 
                          className="w-2 h-2 rounded-full bg-[#1A1A1A] border border-white/30 shrink-0" 
                          title="Black" 
                        />
                        <span className="font-semibold text-[#EDEAE3] truncate">{game.black.username}</span>
                        {game.black.result === 'win' && (
                          <span 
                            className="w-1.5 h-1.5 rounded-full bg-[#7A8471] shrink-0" 
                            title="Winner" 
                          />
                        )}
                      </span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-[#5A5A57] shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Review Game Button */}
      <div className="space-y-3">
        <div className="relative" title={!isGameLoaded ? 'Load a game to enable' : undefined}>
          <button
            onClick={onReviewGame}
            disabled={!isGameLoaded || isReviewing}
            className={`w-full py-2.5 font-bold text-sm rounded-lg transition-all relative overflow-hidden flex items-center justify-center gap-2 border ${
              isGameLoaded
                ? 'btn-brass cursor-pointer'
                : 'bg-[#0F0F11] text-[#3A3A3A] border-[#2A2A2A] cursor-not-allowed opacity-50'
            }`}
          >
            {isReviewing ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-[#1A1408] border-t-transparent rounded-full animate-spin" />
                <span>Analyzing Game...</span>
              </div>
            ) : (
              <>
                <Activity className="w-4 h-4" />
                <span>Review Game</span>
              </>
            )}
          </button>
          {!isGameLoaded && (
            <p className="text-center text-[10px] text-[#5A5A57] mt-1.5">Load a game to enable</p>
          )}
        </div>

        {/* Live Analysis Progress Box */}
        {isReviewing && (
          <div className="bg-[#0F0F11] border border-[#C9A356]/12 rounded-lg p-3 space-y-2 text-xs text-[#8A8A85] shadow-inner">
            <div className="flex justify-between text-[10px] font-semibold uppercase tracking-wider text-[#5A5A57]">
              <span>Analysis Progress</span>
              <span className="text-[#C9A356]" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{Math.round(reviewProgress)}%</span>
            </div>
            <div className="h-[3px] bg-[#1C1C1F] rounded-full overflow-hidden w-full">
              <div className="bg-gradient-to-r from-[#C9A356] to-[#A07E3A] h-full transition-all duration-300" style={{ width: `${reviewProgress}%` }} />
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px] pt-1">
              <div>
                <span className="text-[#5A5A57]">Target Depth:</span>{' '}
                <span className="font-bold text-[#EDEAE3]" style={{ fontFamily: '"JetBrains Mono", monospace' }}>12</span>
              </div>
              <div className="text-right">
                <span className="text-[#5A5A57]">Est. Time:</span>{' '}
                <span className="font-bold text-[#EDEAE3]" style={{ fontFamily: '"JetBrains Mono", monospace' }}>~{Math.max(1, Math.round((100 - reviewProgress) * 0.03))}s</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Live Stats display */}
      <div className="bg-[#0F0F11] border border-[#C9A356]/08 p-3 rounded-lg space-y-1.5">
        {/* Live Engine Running Stats */}
        {(() => {
          const getEngineStatusDetails = () => {
            if (!isConnected) {
              return { color: 'bg-[#C9A356]/60 motion-safe:animate-pulse', text: 'Reconnecting...' };
            }
            switch (engineStatus) {
              case 'Searching':
                return { color: 'bg-[#7A8471] motion-safe:animate-pulse', text: 'Analyzing...' };
              case 'Starting':
                return { color: 'bg-[#C9A356]/80 motion-safe:animate-pulse', text: 'Starting...' };
              case 'Completed':
                return { color: 'bg-[#4A7BAF]', text: 'Done' };
              case 'Cancelling':
                return { color: 'bg-[#C9A356]/60 motion-safe:animate-pulse', text: 'Cancelling...' };
              case 'Error':
                return { color: 'bg-[#8B3A3A]', text: 'Error' };
              default:
                return { color: 'bg-[#3A3A3A]', text: 'Idle' };
            }
          };
          const statusDetails = getEngineStatusDetails();
          return (
            <div className="space-y-2 text-[10px] text-[#5A5A57]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${statusDetails.color}`} />
                  <span className="font-semibold text-[#8A8A85]">Stockfish 16</span>
                  <span className="italic text-[#5A5A57]">({statusDetails.text})</span>
                </div>
                <div>
                  <span>Depth:</span>{' '}
                  <span className="font-bold text-[#EDEAE3]" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{liveDepth || 0} / {settings.depth}</span>
                </div>
              </div>
              
              {/* Progress bar when searching */}
              {engineStatus === 'Searching' && (
                <div className="w-full h-[2px] bg-[#1C1C1F] rounded-full overflow-hidden">
                  <div 
                    className="bg-[#7A8471] h-full transition-all duration-300"
                    style={{ width: `${Math.min(100, ((liveDepth || 0) / settings.depth) * 100)}%` }}
                  />
                </div>
              )}
              
              {liveNps && liveNps > 0 ? (
                <div className="flex items-center justify-between border-t border-white/[0.03] pt-1">
                  <span>Speed:</span>{' '} 
                  <span className="font-bold text-[#EDEAE3]" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{(liveNps / 1000).toFixed(1)} kN/s</span>
                </div>
              ) : null}
            </div>
          );
        })()}
      </div>



    </div>
  );
};
export default ControlPanel;
