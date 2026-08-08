import { useState, useEffect, useCallback, useRef } from 'react';
import { Chess } from 'chess.js';
import { AnimatePresence, motion } from 'framer-motion';
import { Trophy, Settings, ChevronDown, ChevronUp, Zap, Clipboard, Globe } from 'lucide-react';
import Chessboard from './components/Chessboard';
import ControlPanel from './components/ControlPanel';
import MoveList from './components/MoveList';
import type { MoveItem, ReviewStats } from './components/MoveList';
import { EvaluationGraph } from './components/EvaluationGraph';
import { MoveClassificationPopup } from './components/MoveClassificationPopup';
import { PromotionPicker } from './components/PromotionPicker';
import type { PromotionPiece } from './components/PromotionPicker';
import { TelemetryPanel } from './components/TelemetryPanel';
import { useWebSocket } from './hooks/useWebSocket';
import type { AnalysisData, OpeningData, CanonicalEval } from './hooks/useWebSocket';
import { audioSynth } from './utils/audio';
import { getApiUrl } from './config';

const SQUARES = [
  'a8', 'b8', 'c8', 'd8', 'e8', 'f8', 'g8', 'h8',
  'a7', 'b7', 'c7', 'd7', 'e7', 'f7', 'g7', 'h7',
  'a6', 'b6', 'c6', 'd6', 'e6', 'f6', 'g6', 'h6',
  'a5', 'b5', 'c5', 'd5', 'e5', 'f5', 'g5', 'h5',
  'a4', 'b4', 'c4', 'd4', 'e4', 'f4', 'g4', 'h4',
  'a3', 'b3', 'c3', 'd3', 'e3', 'f3', 'g3', 'h3',
  'a2', 'b2', 'c2', 'd2', 'e2', 'f2', 'g2', 'h2',
  'a1', 'b1', 'c1', 'd1', 'e1', 'f1', 'g1', 'h1'
];

const getCapturedPieces = (fen: string) => {
  const startCounts: Record<string, number> = {
    P: 8, N: 2, B: 2, R: 2, Q: 1,
    p: 8, n: 2, b: 2, r: 2, q: 1
  };
  
  const currentCounts: Record<string, number> = {
    P: 0, N: 0, B: 0, R: 0, Q: 0,
    p: 0, n: 0, b: 0, r: 0, q: 0
  };
  
  const piecePart = fen.split(' ')[0];
  for (const char of piecePart) {
    if (startCounts[char] !== undefined) {
      currentCounts[char]++;
    }
  }
  
  const whiteCapturedChars: string[] = []; 
  const blackCapturedChars: string[] = []; 
  
  const values: Record<string, number> = { q: 9, r: 5, b: 3, n: 3, p: 1, Q: 9, R: 5, B: 3, N: 3, P: 1 };
  const symbols: Record<string, string> = {
    p: '♟', n: '♞', b: '♝', r: '♜', q: '♛',
    P: '♙', N: '♘', B: '♗', R: '♖', Q: '♕'
  };
  
  let whiteValue = 0;
  let blackValue = 0;
  
  for (const piece of ['Q', 'R', 'B', 'N', 'P']) {
    whiteValue += currentCounts[piece] * values[piece];
    const diff = startCounts[piece] - currentCounts[piece];
    for (let i = 0; i < diff; i++) {
      blackCapturedChars.push(symbols[piece]);
    }
  }
  for (const piece of ['q', 'r', 'b', 'n', 'p']) {
    blackValue += currentCounts[piece] * values[piece];
    const diff = startCounts[piece] - currentCounts[piece];
    for (let i = 0; i < diff; i++) {
      whiteCapturedChars.push(symbols[piece]);
    }
  }
  
  const materialDiff = whiteValue - blackValue;
  
  return {
    whiteCaptured: whiteCapturedChars,
    blackCaptured: blackCapturedChars,
    whiteLead: materialDiff > 0 ? materialDiff : 0,
    blackLead: materialDiff < 0 ? -materialDiff : 0
  };
};

const parseToCanonicalEval = (scoreStr: string, cp?: number): CanonicalEval => {
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
    // If cp is not provided or is 0, attempt to parse scoreStr (e.g. "+1.23" -> 123)
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

export default function App() {
  // Chess engine representation (chess.js)
  const chessRef = useRef(new Chess());
  
  // Mobile/Responsive states
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [mobileView, setMobileView] = useState<'landing' | 'board'>('landing');
  const [controlPanelTab, setControlPanelTab] = useState<'pgn' | 'fen' | 'chesscom'>('pgn');
  const [controlsExpanded, setControlsExpanded] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) {
        setMobileView('board');
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Basic states
  const [fen, setFen] = useState(chessRef.current.fen());
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [history, setHistory] = useState<MoveItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1); // -1 = start position
  
  // Settings
  const [settings, setSettings] = useState({ depth: 18, soundVolume: 0.25, soundMuted: false, showSecondBestMove: false });

  const playMoveSound = (san: string) => {
    if (settings.soundMuted) return;
    const vol = settings.soundVolume;
    if (san.endsWith('#')) {
      audioSynth.playCheckmate(vol);
    } else if (san.endsWith('+')) {
      audioSynth.playCheck(vol);
    } else if (san.includes('x')) {
      audioSynth.playCapture(vol);
    } else {
      audioSynth.playNormal(vol);
    }
  };

  // Stockfish evaluation states
  const [evaluation, setEvaluation] = useState<string>('+0.35');
  const [evaluationCanonical, setEvaluationCanonical] = useState<CanonicalEval | null>({
    type: 'cp',
    value: 35,
    score_str: '+0.35',
    white_win_prob: 0.5498, // 1 / (1 + 10 ** (-35/400))
    normalized: 0.35
  });
  const [bestMove, setBestMove] = useState<string | null>(null);
  const [secondBestMove, setSecondBestMove] = useState<string | null>(null);
  const [terminalResult, setTerminalResult] = useState<string | null>(null);
  const [pv, setPv] = useState<string[]>([]);
  const [pvFen, setPvFen] = useState<string>('');
  const [openingName, setOpeningName] = useState<string>('');
  const [openingEco, setOpeningEco] = useState<string>('');
  const [openingVariation, setOpeningVariation] = useState<string>('');
  const [openingStatus, setOpeningStatus] = useState<string>('Book');
  
  // Game review states
  const [isGameLoaded, setIsGameLoaded] = useState<boolean>(false);
  const [isReviewing, setIsReviewing] = useState<boolean>(false);
  const [reviewProgress, setReviewProgress] = useState<number>(0);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [isReviewMode, setIsReviewMode] = useState<boolean>(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [liveDepth, setLiveDepth] = useState<number>(0);
  const [liveNps, setLiveNps] = useState<number>(0);
  const [gameHeaders, setGameHeaders] = useState<Record<string, string | null>>({});
  const [notification, setNotification] = useState<string | null>(null);

  // Transient Chess Exploration States
  const [exploredFen, setExploredFen] = useState<string | null>(null);
  const [exploredLastMove, setExploredLastMove] = useState<[string, string] | null>(null);
  const [exploredLegalDests, setExploredLegalDests] = useState<Map<string, string[]>>(new Map());
  // Terminal result for the explored position specifically — shown in the banner.
  // Separate from terminalResult (which is the reviewed game's game-over state).
  const [explorationTerminalResult, setExplorationTerminalResult] = useState<string | null>(null);

  // Pawn promotion picker state
  // When a pawn move lands on the last rank, we pause here instead of executing
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: string; to: string; color: 'white' | 'black'; isExploration: boolean;
  } | null>(null);
  // Board pixel size — populated by Chessboard's onBoardSizeChange, used to position the picker
  const [boardSize, setBoardSize] = useState<number>(560);
  // Imperative ref to Chessground's snap function — used to revert a cancelled promotion
  const snapBoardRef = useRef<(() => void) | null>(null);

  // Advanced Telemetry & Performance states
  const [engineStatus, setEngineStatus] = useState<'Idle' | 'Starting' | 'Searching' | 'Cancelling' | 'Completed' | 'Error'>('Idle');
  const [searchStart, setSearchStart] = useState<string>('');
  const [searchEnd, setSearchEnd] = useState<string>('');
  const [engineLatency, setEngineLatency] = useState<number>(0);
  const [wsRtt, setWsRtt] = useState<number>(0);
  const [poolTelemetry, setPoolTelemetry] = useState<any>({
    engines_available: 3,
    engines_in_use: 0,
    active_searches: 0,
    cancelled_searches: 0,
    completed_searches: 0,
    avg_search_duration: 0,
    avg_queue_wait_time: 0,
    cancellation_count: 0,
    engine_restart_count: 0,
    pool_health: 'Healthy'
  });
  
  // Message updates counters
  const [evalUpdatesCount, setEvalUpdatesCount] = useState<number>(0);
  const [pvUpdatesCount, setPvUpdatesCount] = useState<number>(0);
  const [arrowUpdatesCount, setArrowUpdatesCount] = useState<number>(0);
  const [openingUpdatesCount, setOpeningUpdatesCount] = useState<number>(0);
  const [graphUpdatesCount, setGraphUpdatesCount] = useState<number>(0);

  // Performance tracking refs
  const positionSourceRef = useRef<string>('initial');
  const searchStartTimeRef = useRef<number>(0);
  const lastDepthUpdateTimeRef = useRef<number>(0);
  const renderCountRef = useRef<number>(0);
  renderCountRef.current++;

  // Auto-clear toast notifications
  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => {
      setNotification(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [notification]);

  // Local FEN analysis cache to avoid recomputing visited states
  // Key: EPD (first 4 fields of FEN), Value: AnalysisData
  const localAnalysisCache = useRef<Map<string, AnalysisData>>(new Map());
  const positionGenIdRef = useRef<number>(0);

  // Watchdog & Connection tracking refs
  const currentFenRef = useRef<string>(new Chess().fen());
  const currentHistoryRef = useRef<MoveItem[]>([]);
  const currentIndexRef = useRef<number>(-1);
  const watchdogTimerRef = useRef<any>(null);
  const watchdogRetryCountRef = useRef<number>(0);
  const triggerAnalysisRef = useRef<any>(null);

  // Ref that always mirrors the FEN sent to the engine last (game FEN OR explored FEN).
  // Used by handleAnalysisUpdate so async engine packets are matched against the
  // correct FEN even when exploration mode is active.
  const expectedFenRef = useRef<string>('');

  // Ref that mirrors exploredFen state so async callbacks can read it without
  // closure staleness (exploredFen state itself is only safe to read in render).
  const exploredFenRef = useRef<string | null>(null);

  // Ref tracking whether the last triggerAnalysis call was an exploration move.
  // Used by the watchdog retry so it can pass the correct isExplorationMove flag
  // without creating a closure dependency on React state.
  const isExplorationMoveRef = useRef<boolean>(false);

  // Opening gen-id tracking: only accept opening packets matching current gen
  const openingGenIdRef = useRef<number>(0);

  const [debugMode, setDebugMode] = useState(false);

  // Session-wide metrics for analysis tracking & debugging
  const metricsRef = useRef({
    requestsSent: 0,
    responsesReceivedCount: 0,
    openingUpdatesReceived: 0,
  });

  // DEBUG flag — set true to see gen_id and session metrics telemetry in the console
  const DEBUG_GEN_ID = true;

  // Helper to compute legal destinations for Chessground
  const getLegalDests = useCallback((chessInstance: Chess) => {
    const dests = new Map<string, string[]>();
    SQUARES.forEach((s) => {
      const moves = chessInstance.moves({ square: s as any, verbose: true });
      if (moves.length) {
        dests.set(s, moves.map((m) => m.to));
      }
    });
    return dests;
  }, []);

  const [legalDests, setLegalDests] = useState<Map<string, string[]>>(
    getLegalDests(chessRef.current)
  );

  const [lastMove, setLastMove] = useState<[string, string] | null>(null);

  const latestAnalysisRef = useRef<AnalysisData | null>(null);
  const analysisThrottleTimerRef = useRef<any>(null);

  // Watchdog helper
  const startWatchdog = useCallback(() => {
    if (watchdogTimerRef.current) {
      clearTimeout(watchdogTimerRef.current);
    }
    const currentGenId = positionGenIdRef.current;

    if (DEBUG_GEN_ID) {
      console.log(`[FRONTEND] [GEN_ID] Watchdog started for gen_id: ${currentGenId}`);
    }

    watchdogTimerRef.current = setTimeout(() => {
      const latestGenId = positionGenIdRef.current;
      if (currentGenId === latestGenId) {
        console.warn(`[FRONTEND] [WATCHDOG] No engine response for gen_id: ${currentGenId} within 5s. Retrying...`);
        if (triggerAnalysisRef.current) {
          // Pass the isExplorationMove flag and isRetry=true
          triggerAnalysisRef.current(
            currentFenRef.current,
            currentHistoryRef.current,
            currentIndexRef.current,
            isExplorationMoveRef.current,
            true // isRetry
          );
        }
      } else {
        if (DEBUG_GEN_ID) {
          console.log(`[FRONTEND] [WATCHDOG] Ignored stale gen_id: ${currentGenId} (current is ${latestGenId})`);
        }
      }
    }, 5000); // 5s watchdog – gives more time for high-depth searches
  }, []);

  const commitAnalysis = useCallback((data: AnalysisData & { telemetry?: any }) => {
    // Gen ID / Position ID Check (Gap 2 Fix)
    if (data.genId !== undefined && data.genId !== positionGenIdRef.current) {
      if (DEBUG_GEN_ID) {
        console.log(`[FRONTEND] [GEN_ID] Discarding stale commit request. Packet Gen: ${data.genId}, Active Gen: ${positionGenIdRef.current}`);
      }
      return;
    }

    lastDepthUpdateTimeRef.current = performance.now();
    if (watchdogTimerRef.current) {
      if (DEBUG_GEN_ID) {
        console.log(`[FRONTEND] [GEN_ID] Watchdog cleared by active packet for gen_id: ${data.genId}`);
      }
      clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }

    setEvaluation(data.score);
    if (data.evalCanonical) {
      setEvaluationCanonical(data.evalCanonical);
    } else {
      const cp = (data as any).cp !== undefined ? (data as any).cp : 0;
      setEvaluationCanonical(parseToCanonicalEval(data.score, cp));
    }
    const best = data.bestMove || (data.pv && data.pv.length > 0 ? data.pv[0] : null);
    let second = data.secondBestMove || (data.pv2 && data.pv2.length > 0 ? data.pv2[0] : null);
    if (second === best) {
      second = null;
    }
    setBestMove(best);
    setSecondBestMove(second || null);
    setPv(data.pv || []);
    setPvFen(data.fen);
    
    // Set engine status and search end timestamp if target depth reached
    if (data.depth >= settings.depth) {
      setEngineStatus('Completed');
      const nowStr = new Date().toLocaleTimeString();
      setSearchEnd(nowStr);
    } else {
      setEngineStatus('Searching');
    }

    // Update latency on first depth > 0 packet
    if (data.depth > 0) {
      setLiveDepth((prevDepth) => {
        if (prevDepth === 0 && searchStartTimeRef.current > 0) {
          const lat = performance.now() - searchStartTimeRef.current;
          setEngineLatency(lat);
        }
        return data.depth;
      });
    } else {
      setLiveDepth(data.depth);
    }

    setLiveNps(data.nps || 0);

    // Update message counters
    setEvalUpdatesCount((c) => c + 1);
    if (data.pv && data.pv.length > 0) {
      setPvUpdatesCount((c) => c + 1);
    }
    if (data.bestMove || data.secondBestMove) {
      setArrowUpdatesCount((c) => c + 1);
    }

    // Telemetry updates
    if (data.telemetry) {
      setPoolTelemetry(data.telemetry);
    }

    // Sync evaluation with history item at currently displayed index for persistent graph.
    // IMPORTANT: Skip this sync entirely when in exploration mode — we must never
    // write live exploration evals back into the immutable reviewed game history.
    const isExploring = exploredFenRef.current !== null;
    if (!isExploring) {
      setHistory((prevHistory) => {
        if (currentIndexRef.current >= 0 && currentIndexRef.current < prevHistory.length) {
          const historyItem = prevHistory[currentIndexRef.current];
          const histKey = historyItem.fen_after.split(' ').slice(0, 4).join(' ');
          const dataKey = data.fen.split(' ').slice(0, 4).join(' ');
          
          if (histKey === dataKey && (historyItem.eval !== data.score || !historyItem.eval_canonical)) {
            const updated = [...prevHistory];
            updated[currentIndexRef.current] = {
              ...updated[currentIndexRef.current],
              eval: data.score,
              eval_canonical: data.evalCanonical || parseToCanonicalEval(data.score)
            };
            setGraphUpdatesCount((c) => c + 1);
            return updated;
          }
        }
        return prevHistory;
      });
    }
  }, [settings.depth]);

  // Callback: WebSocket incremental Stockfish updates
  const handleAnalysisUpdate = useCallback((data: AnalysisData) => {
    // Match against expectedFenRef (set by triggerAnalysis) which correctly reflects
    // the FEN sent to the engine — this may be an explored FEN, not the game FEN.
    const expectedKey = expectedFenRef.current.split(' ').slice(0, 4).join(' ');
    const dataKey = data.fen.split(' ').slice(0, 4).join(' ');
    const isGenMatch = data.genId === undefined || data.genId === positionGenIdRef.current;
    const isAccepted = expectedKey === dataKey && isGenMatch;

    if (DEBUG_GEN_ID) {
      console.log(`[FRONTEND] [GEN_ID] Analysis packet: FEN match=${expectedKey === dataKey}, genId=${data.genId}, current=${positionGenIdRef.current}, accepted=${isAccepted}, depth=${data.depth}`);
    }

    if (isAccepted) {
      metricsRef.current.responsesReceivedCount++;

      // Hard-gate terminal positions in updates to prevent Stockfish analysis
      // of finished games from overwriting the clean terminal state.
      let isTerminal = false;
      try {
        isTerminal = new Chess(data.fen).isGameOver();
      } catch {}

      if (isTerminal) {
        localAnalysisCache.current.delete(dataKey);
        return;
      }

      if (DEBUG_GEN_ID) {
        const drift = metricsRef.current.requestsSent - metricsRef.current.responsesReceivedCount;
        console.log(`[FRONTEND] [METRICS] Accepted Analysis Packet #${metricsRef.current.responsesReceivedCount} for Gen ID: ${data.genId}. Cumulative drift (Sent - Received): ${drift}`);
      }

      // Cache it locally (key on the data FEN, not the game FEN)
      localAnalysisCache.current.set(dataKey, data);
      
      latestAnalysisRef.current = data;

      if (!analysisThrottleTimerRef.current) {
        // Leading edge: update immediately
        commitAnalysis(data);
        
        // Set throttle timer
        analysisThrottleTimerRef.current = setTimeout(() => {
          analysisThrottleTimerRef.current = null;
          const latest = latestAnalysisRef.current;
          if (latest && (latest.genId === undefined || latest.genId === positionGenIdRef.current)) {
            if (DEBUG_GEN_ID) {
              console.log(`[FRONTEND] [GEN_ID] Throttled trailing edge committed for gen_id: ${latest.genId}`);
            }
            commitAnalysis(latest);
            latestAnalysisRef.current = null;
          }
        }, 120); // 120ms throttle
      }
    }
  }, [commitAnalysis]);

  // Clear throttle timer on unmount
  useEffect(() => {
    return () => {
      if (analysisThrottleTimerRef.current) {
        clearTimeout(analysisThrottleTimerRef.current);
      }
    };
  }, []);



  // Callback: WebSocket opening updates
  // FIX: check gen_id so stale out-of-order opening packets from previous positions
  // cannot overwrite the current position's opening display.
  const handleOpeningUpdate = useCallback((data: OpeningData & { genId?: number; telemetry?: any }) => {
    metricsRef.current.openingUpdatesReceived++;
    setOpeningUpdatesCount((c) => c + 1);
    
    if (DEBUG_GEN_ID) {
      console.log(`[FRONTEND] [METRICS] Accepted Opening Packet #${metricsRef.current.openingUpdatesReceived} for Gen ID: ${data.genId}. Opening: ${data.name || 'Out of book'}`);
    }

    // Reject stale opening packets from previous positions
    if (data.genId !== undefined && data.genId !== openingGenIdRef.current) {
      if (DEBUG_GEN_ID) {
        console.log(`[FRONTEND] [GEN_ID] Opening packet rejected: genId=${data.genId}, current=${openingGenIdRef.current}`);
      }
      return;
    }

    // Update RTT
    if (searchStartTimeRef.current > 0) {
      const rtt = performance.now() - searchStartTimeRef.current;
      setWsRtt(rtt);
    }

    if (data.telemetry) {
      setPoolTelemetry(data.telemetry);
    }

    // FIX: backend returns name="" for out-of-book positions. Never let an empty
    // name overwrite a valid opening name — keep the last known opening visible
    // and only update the status to "Out of Book".
    if (!data.name && data.status === 'Out of Book') {
      // Retain current opening name but update status
      setOpeningStatus('Out of Book');
      return;
    }

    setOpeningEco(data.eco);
    setOpeningName(data.name || '');
    setOpeningVariation(data.variation);
    setOpeningStatus(data.status);
  }, []);

  const handleConnectionChange = useCallback((connected: boolean) => {
    if (connected) {
      if (DEBUG_GEN_ID) {
        console.log('[FRONTEND] [GEN_ID] WebSocket connected/reconnected. Triggering fresh analysis.');
      }
      if (triggerAnalysisRef.current) {
        triggerAnalysisRef.current(currentFenRef.current, currentHistoryRef.current, currentIndexRef.current);
      }
    }
  }, []);

  const handleConnectionError = useCallback((err: string) => {
    setNotification(err);
  }, []);

  // Hook WebSocket connection
  const { isConnected, analyzePosition } = useWebSocket({
    onAnalysisUpdate: handleAnalysisUpdate,
    onOpeningUpdate: handleOpeningUpdate,
    onConnectionChange: handleConnectionChange,
    onConnectionError: handleConnectionError,
  });

  // Periodic watchdog stall recovery hook
  // Monitors if the engine search gets stuck without making depth progress for > 1.5s
  useEffect(() => {
    const watchdogInterval = setInterval(() => {
      if ((engineStatus === 'Starting' || engineStatus === 'Searching') && isConnected) {
        const elapsed = performance.now() - lastDepthUpdateTimeRef.current;
        if (elapsed > 1500) {
          console.warn(`[WATCHDOG_STALL] Stall detected! Diagnostic Info:
            FEN: ${currentFenRef.current}
            Gen ID: ${positionGenIdRef.current}
            Current Depth: ${liveDepth}
            Target Depth: ${settings.depth}
            Elapsed since last update: ${elapsed.toFixed(0)}ms
            Status: ${engineStatus}
          `);
          
          setEngineStatus('Cancelling');
          if (triggerAnalysisRef.current) {
            // Preserve isExplorationMove flag on stall recovery retries.
            triggerAnalysisRef.current(
              currentFenRef.current,
              currentHistoryRef.current,
              currentIndexRef.current,
              isExplorationMoveRef.current
            );
          }
        }
      }
    }, 500);

    return () => clearInterval(watchdogInterval);
  }, [engineStatus, liveDepth, settings.depth, isConnected]);

  // ─── CORE FIX: triggerAnalysis ───────────────────────────────────────────────
  // Every position change (live move, navigation click, keyboard arrow, PV play)
  // flows through here. This is the single position-change handler.
  //
  // Key fixes applied:
  // 1. Atomically clear the throttle timer + latestAnalysisRef at entry so the
  //    FIRST packet from the backend always gets the leading-edge commit path —
  //    not suppressed because a 120ms timer from the previous position is still
  //    pending.
  // 2. Increment positionGenIdRef AND openingGenIdRef together so both the
  //    analysis filter and the opening filter reference the same generation.
  // 3. Always reset liveDepth=0 and pv=[] when there's no cached result, keeping
  //    depth and PV strictly in sync (no contradictory "Depth 6 / PV Waiting").
  // ────────────────────────────────────────────────────────────────────────────
  const triggerAnalysis = useCallback((targetFen: string, movesHistory?: MoveItem[], targetIndex?: number, isExplorationMove = false, isRetry = false) => {
    if (!isConnected) {
      if (DEBUG_GEN_ID) {
        console.log(`[FRONTEND] [GEN_ID] triggerAnalysis ignored: WebSocket is not connected.`);
      }
      setEngineStatus('Idle');
      if (watchdogTimerRef.current) {
        clearTimeout(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
      return;
    }

    if (!isRetry) {
      watchdogRetryCountRef.current = 0;
    } else {
      if (watchdogRetryCountRef.current < 3) {
        watchdogRetryCountRef.current++;
        console.warn(`[FRONTEND] [WATCHDOG] Retry attempt ${watchdogRetryCountRef.current}/3 for gen_id: ${positionGenIdRef.current}`);
      } else {
        console.error(`[FRONTEND] [WATCHDOG] Max retries (3) exceeded for gen_id: ${positionGenIdRef.current}. Stopping retries.`);
        if (watchdogTimerRef.current) {
          clearTimeout(watchdogTimerRef.current);
          watchdogTimerRef.current = null;
        }
        setNotification("Backend engine analysis timed out. The server might be busy or unresponsive.");
        setEngineStatus('Idle');
        return;
      }
    }

    // ── FIX 1: Flush any pending throttle state from the previous position ──
    if (analysisThrottleTimerRef.current) {
      clearTimeout(analysisThrottleTimerRef.current);
      analysisThrottleTimerRef.current = null;
    }
    latestAnalysisRef.current = null;

    // ── FIX 2: Increment both gen IDs atomically ──
    const newGenId = ++positionGenIdRef.current;
    openingGenIdRef.current = newGenId;

    // ── Track the FEN we sent to the engine so handleAnalysisUpdate can match it ──
    // This is the critical fix for exploration mode: the engine receives exploredFen
    // but handleAnalysisUpdate used to compare against the game FEN from state.
    expectedFenRef.current = targetFen;

    // ── Record whether this call is an exploration move for watchdog retries ──
    isExplorationMoveRef.current = isExplorationMove;

    metricsRef.current.requestsSent++;
    
    // Set engine status to Starting and record timestamps
    setEngineStatus('Starting');
    const startStr = new Date().toLocaleTimeString();
    setSearchStart(startStr);
    setSearchEnd('');
    setEngineLatency(0);
    setWsRtt(0);
    searchStartTimeRef.current = performance.now();

    if (DEBUG_GEN_ID) {
      console.log(`[FRONTEND] [GEN_ID] triggerAnalysis: FEN = ${targetFen}, newGenId = ${newGenId}, exploration=${isExplorationMove}`);
      console.log(`[FRONTEND] [METRICS] triggerAnalysis Sent Request #${metricsRef.current.requestsSent} for Gen ID: ${newGenId}`);
    }

    // Cache parameters in refs for watchdog retries
    currentFenRef.current = targetFen;
    currentHistoryRef.current = movesHistory || history;
    
    const moves = movesHistory || history;
    const idx = targetIndex !== undefined ? targetIndex : currentIndex;
    currentIndexRef.current = idx;
    
    // When exploring an alternative line, pass empty UCI moves and treat as FEN load
    // so the opening detector doesn't receive a mismatched game move sequence.
    const uciMoves = isExplorationMove ? [] : moves.slice(0, idx + 1).map((h) => h.uci);
    const isFenLoad = isExplorationMove || (moves.length === 0 && targetFen !== new Chess().fen());

    // Synchronously clear recommendations first
    setBestMove(null);
    setSecondBestMove(null);

    // Guard: check if the position is terminal (checkmate, stalemate, draw)
    const tempChess = new Chess(targetFen);
    if (tempChess.isGameOver()) {
      let reason = "Game Over";
      if (tempChess.isCheckmate()) {
        const loser = tempChess.turn() === 'w' ? 'White' : 'Black';
        const winner = loser === 'White' ? 'Black' : 'White';
        reason = `Checkmate — ${winner} wins`;
        setEvaluation(loser === 'White' ? 'B' : 'W');
        setEvaluationCanonical({
          type: 'mate',
          value: 0,
          score_str: loser === 'White' ? '-M0' : 'M0',
          white_win_prob: loser === 'White' ? 0.0 : 1.0,
          normalized: loser === 'White' ? -10.0 : 10.0
        });
      } else if (tempChess.isDraw()) {
        if (tempChess.isStalemate()) {
          reason = "Stalemate — Draw";
        } else {
          reason = "Draw";
        }
        setEvaluation("Draw");
        setEvaluationCanonical({
          type: 'cp',
          value: 0,
          score_str: 'Draw',
          white_win_prob: 0.5,
          normalized: 0.0
        });
      }
      
      // Got terminal state: cancel watchdog
      if (watchdogTimerRef.current) {
        clearTimeout(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }

      // In exploration mode, don't overwrite the review's terminal result.
      // Instead, set the dedicated exploration terminal result.
      if (isExplorationMove) {
        setExplorationTerminalResult(reason);
      } else {
        setTerminalResult(reason);
      }
      setPv([]);
      setPvFen(targetFen);
      setLiveDepth(0);
      setLiveNps(0);
      setEngineStatus('Idle');
      return;
    }

    // Clear any stale exploration terminal result when starting a new non-terminal search.
    if (isExplorationMove) {
      setExplorationTerminalResult(null);
    } else {
      setTerminalResult(null);
    }

    const epdKey = targetFen.split(' ').slice(0, 4).join(' ');
    const cached = localAnalysisCache.current.get(epdKey);

    // Start watchdog timer before sending request
    startWatchdog();

    if (cached) {
      setEvaluation(cached.score);
      if (cached.evalCanonical) {
        setEvaluationCanonical(cached.evalCanonical);
      } else {
        const cp = (cached as any).cp !== undefined ? (cached as any).cp : 0;
        setEvaluationCanonical(parseToCanonicalEval(cached.score, cp));
      }
      const best = cached.bestMove || (cached.pv && cached.pv.length > 0 ? cached.pv[0] : null);
      let second = cached.secondBestMove || (cached.pv2 && cached.pv2.length > 0 ? cached.pv2[0] : null);
      if (second === best) {
        second = null;
      }
      setBestMove(best);
      setSecondBestMove(second || null);
      setPv(cached.pv || []);
      setPvFen(targetFen);
      setLiveDepth(cached.depth);
      setLiveNps(cached.nps || 0);
      
      if (cached.depth >= settings.depth) {
        setEngineStatus('Completed');
        setSearchEnd(new Date().toLocaleTimeString());
      } else {
        setEngineStatus('Searching');
      }

      analyzePosition(
        targetFen,
        settings.depth,
        uciMoves,
        isFenLoad,
        newGenId,
        idx,
        positionSourceRef.current,
        settings.showSecondBestMove ? 2 : 1
      );
    } else {
      setPv([]);
      setLiveDepth(0);
      setLiveNps(0);
      analyzePosition(
        targetFen,
        settings.depth,
        uciMoves,
        isFenLoad,
        newGenId,
        idx,
        positionSourceRef.current,
        settings.showSecondBestMove ? 2 : 1
      );
    }
  }, [analyzePosition, settings.depth, settings.showSecondBestMove, history, currentIndex, startWatchdog]);

  // Keep triggerAnalysisRef current to break circular dependencies
  useEffect(() => {
    triggerAnalysisRef.current = triggerAnalysis;
  }, [triggerAnalysis]);

  // Re-trigger analysis automatically when settings (depth or showSecondBestMove) change
  useEffect(() => {
    if (isConnected && currentFenRef.current) {
      if (DEBUG_GEN_ID) {
        console.log(`[FRONTEND] Settings changed (depth: ${settings.depth}, showSecondBestMove: ${settings.showSecondBestMove}). Re-triggering analysis.`);
      }
      triggerAnalysis(currentFenRef.current, currentHistoryRef.current, currentIndexRef.current);
    }
  }, [settings.depth, settings.showSecondBestMove]);

  // Re-trigger analysis automatically when connection is restored after a drop
  useEffect(() => {
    if (isConnected && currentFenRef.current) {
      console.log('[FRONTEND] WebSocket connection restored. Re-triggering analysis.');
      triggerAnalysis(currentFenRef.current, currentHistoryRef.current, currentIndexRef.current);
    }
  }, [isConnected, triggerAnalysis]);

  // Navigate to specific position index
  const selectPosition = useCallback((index: number, customHistory?: MoveItem[]) => {
    // Discard any transient exploration path when returning to the original game line
    setExploredFen(null);
    setExploredLastMove(null);
    setExploredLegalDests(new Map());
    setExplorationTerminalResult(null); // Clear exploration terminal result
    exploredFenRef.current = null; // Keep ref in sync
    isExplorationMoveRef.current = false; // Back to game mode

    // Reconstruct chess board state up to index
    const chessInstance = new Chess();
    const activeHistory = customHistory || history;
    
    if (index === -1) {
      // Starting position
      chessRef.current = chessInstance;
      setFen(chessInstance.fen());
      setLegalDests(getLegalDests(chessInstance));
      setLastMove(null);
      setCurrentIndex(-1);
      
      setOpeningName('Starting Position');
      setOpeningEco('');
      setOpeningVariation('');
      setOpeningStatus('Book');
      
      triggerAnalysis(chessInstance.fen(), activeHistory, -1);
      return;
    }

    // Play moves up to index
    for (let i = 0; i <= index; i++) {
      chessInstance.move(activeHistory[i].san);
    }

    chessRef.current = chessInstance;
    setFen(chessInstance.fen());
    setLegalDests(getLegalDests(chessInstance));
    
    // Set last move highlights
    const lastPlayed = activeHistory[index];
    if (lastPlayed && lastPlayed.uci) {
      setLastMove([lastPlayed.uci.slice(0, 2), lastPlayed.uci.slice(2, 4)]);
      // Restore opening details if cached from game review
      if (lastPlayed.opening) {
        setOpeningName(lastPlayed.opening.name || '');
        setOpeningEco(lastPlayed.opening.eco || '');
        setOpeningVariation(lastPlayed.opening.variation || '');
        setOpeningStatus(lastPlayed.opening.status || 'Book');
      }
    } else {
      setLastMove(null);
    }

    setCurrentIndex(index);
    triggerAnalysis(chessInstance.fen(), activeHistory, index);
  }, [history, getLegalDests, triggerAnalysis]);

  // Helper: returns true if moving a pawn from->to is a promotion move
  const isPromotionMove = (from: string, to: string, boardFenForCheck: string): boolean => {
    try {
      const piece = new Chess(boardFenForCheck).get(from as any);
      if (!piece || piece.type !== 'p') return false;
      const toRank = to[1];
      return (piece.color === 'w' && toRank === '8') || (piece.color === 'b' && toRank === '1');
    } catch {
      return false;
    }
  };

  // Handle board drag-and-drop moves made by user
  const handleBoardMove = useCallback((from: string, to: string) => {
    if (from === to) return;
    positionSourceRef.current = 'live_move';
    const chessInstance = chessRef.current;

    // If viewing an analysed game (isReviewMode is true), play moves on a temporary exploration branch
    if (isReviewMode) {
      const activeIdx = previewIndex !== null ? previewIndex : currentIndex;
      const activeMove = activeIdx >= 0 && activeIdx < history.length ? history[activeIdx] : null;
      const baseFen = exploredFen !== null
        ? exploredFen
        : (activeIdx === -1 ? (history[0]?.fen_before || new Chess().fen()) : (activeMove?.fen_after || fen));

      // Intercept promotion moves — pause and show picker
      if (isPromotionMove(from, to, baseFen)) {
        const tempChess = new Chess(baseFen);
        const piece = tempChess.get(from as any);
        const color = piece?.color === 'w' ? 'white' : 'black';
        setPendingPromotion({ from, to, color, isExploration: true });
        return;
      }

      const tempChess = new Chess(baseFen);
      try {
        const move = tempChess.move({ from, to, promotion: 'q' });
        if (move) {
          playMoveSound(move.san);
          // Clear PV recommendations first
          setBestMove(null);
          setSecondBestMove(null);
          setPv([]);
          
          const newFen = tempChess.fen();
          // Update ref immediately so commitAnalysis's graph-sync guard sees
          // the new explored FEN before any async engine packet arrives.
          exploredFenRef.current = newFen;
          setExploredFen(newFen);
          setExploredLastMove([from, to]);
          setExploredLegalDests(getLegalDests(tempChess));

          // Trigger live Stockfish analysis on the explored position.
          // isExplorationMove=true: sends empty uci_moves, skips opening update,
          // and prevents opening state from being overwritten with stale data.
          triggerAnalysis(newFen, undefined, undefined, true);
        }
      } catch (err) {
        console.warn('Invalid exploratory move:', err);
      }
      return;
    }

    // Intercept promotion moves in normal play — pause and show picker
    if (isPromotionMove(from, to, chessInstance.fen())) {
      const piece = chessInstance.get(from as any);
      const color = piece?.color === 'w' ? 'white' : 'black';
      setPendingPromotion({ from, to, color, isExploration: false });
      return;
    }

    try {
      const move = chessInstance.move({ from, to });
      if (move) {
        playMoveSound(move.san);
        // Synchronously clear recommendations first
        setBestMove(null);
        setSecondBestMove(null);
        setPv([]);
        
        // We successfully played a move
        const newFen = chessInstance.fen();
        console.log('[FRONTEND] Move played:', from + to, 'Current FEN:', newFen, 'Chess.js turn():', chessInstance.turn());
        setFen(newFen);
        setLegalDests(getLegalDests(chessInstance));
        setLastMove([from, to]);

        // Construct new move item
        const newMoveItem: MoveItem = {
          move_number: chessInstance.history().length,
          color: chessInstance.turn() === 'b' ? 'white' : 'black', // opposite because turn changed
          san: move.san,
          uci: from + to,
          fen_before: fen,
          fen_after: newFen,
        };

        // If we made a move in the middle of history, truncate variations
        const newHistory = [...history.slice(0, currentIndex + 1), newMoveItem];
        setIsGameLoaded(true); // Board has moves, so we can run review
        
        // Trigger analysis or handle terminal state
        if (chessInstance.isGameOver()) {
          let reason = "Game Over";
          let finalEval = '0.00';
          let finalEvalCanonical: CanonicalEval = {
            type: 'cp',
            value: 0,
            score_str: 'Draw',
            white_win_prob: 0.5,
            normalized: 0.0
          };

          if (chessInstance.isCheckmate()) {
            const loser = chessInstance.turn() === 'w' ? 'White' : 'Black';
            const winner = loser === 'White' ? 'Black' : 'White';
            reason = `Checkmate — ${winner} wins`;
            finalEval = loser === 'White' ? 'B' : 'W';
            finalEvalCanonical = {
              type: 'mate',
              value: 0,
              score_str: loser === 'White' ? '-M0' : 'M0',
              white_win_prob: loser === 'White' ? 0.0 : 1.0,
              normalized: loser === 'White' ? -10.0 : 10.0
            };
          } else if (chessInstance.isDraw()) {
            if (chessInstance.isStalemate()) {
              reason = "Stalemate — Draw";
            } else {
              reason = "Draw";
            }
            finalEval = 'Draw';
            finalEvalCanonical = {
              type: 'cp',
              value: 0,
              score_str: 'Draw',
              white_win_prob: 0.5,
              normalized: 0.0
            };
          }

          if (newHistory.length > 0) {
            newHistory[newHistory.length - 1] = {
              ...newHistory[newHistory.length - 1],
              eval: finalEval,
              eval_canonical: finalEvalCanonical
            };
          }

          setHistory(newHistory);
          setCurrentIndex(newHistory.length - 1);
          setTerminalResult(reason);
          setEvaluation(finalEval);
          setEvaluationCanonical(finalEvalCanonical);
          setBestMove(null);
          setSecondBestMove(null);
          setPv([]);
          setPvFen(newFen);
          setLiveDepth(0);
          setLiveNps(0);
        } else {
          setHistory(newHistory);
          setCurrentIndex(newHistory.length - 1);
          triggerAnalysis(newFen, newHistory, newHistory.length - 1);
        }
      }
    } catch (err) {
      console.warn('Invalid move attempted:', err);
    }
  }, [fen, history, currentIndex, getLegalDests, triggerAnalysis, isReviewMode, exploredFen, previewIndex]);

  // Called when user picks a piece in the promotion picker
  const handlePromotionSelect = useCallback((piece: PromotionPiece) => {
    if (!pendingPromotion) return;
    const { from, to, isExploration } = pendingPromotion;
    setPendingPromotion(null); // dismiss picker

    if (isExploration) {
      // Exploration branch (review mode)
      const activeIdx = previewIndex !== null ? previewIndex : currentIndex;
      const activeMove = activeIdx >= 0 && activeIdx < history.length ? history[activeIdx] : null;
      const baseFen = exploredFen !== null
        ? exploredFen
        : (activeIdx === -1 ? (history[0]?.fen_before || new Chess().fen()) : (activeMove?.fen_after || fen));
      const tempChess = new Chess(baseFen);
      try {
        const move = tempChess.move({ from, to, promotion: piece });
        if (move) {
          playMoveSound(move.san);
          setBestMove(null); setSecondBestMove(null); setPv([]);
          const newFen = tempChess.fen();
          exploredFenRef.current = newFen;
          setExploredFen(newFen);
          setExploredLastMove([from, to]);
          setExploredLegalDests(getLegalDests(tempChess));
          triggerAnalysis(newFen, undefined, undefined, true);
        }
      } catch (err) {
        console.warn('Invalid promotion (exploration):', err);
      }
    } else {
      // Normal play branch
      const chessInstance = chessRef.current;
      try {
        const move = chessInstance.move({ from, to, promotion: piece });
        if (move) {
          playMoveSound(move.san);
          setBestMove(null); setSecondBestMove(null); setPv([]);
          const newFen = chessInstance.fen();
          console.log('[FRONTEND] Promotion played:', from + to + piece, 'FEN:', newFen);
          setFen(newFen);
          setLegalDests(getLegalDests(chessInstance));
          setLastMove([from, to]);
          const newMoveItem: MoveItem = {
            move_number: chessInstance.history().length,
            color: chessInstance.turn() === 'b' ? 'white' : 'black',
            san: move.san,
            uci: from + to + piece,
            fen_before: fen,
            fen_after: newFen,
          };
          const newHistory = [...history.slice(0, currentIndex + 1), newMoveItem];
          setIsGameLoaded(true);
          if (chessInstance.isGameOver()) {
            let reason = "Game Over";
            let finalEval = '0.00';
            let finalEvalCanonical: CanonicalEval = { type: 'cp', value: 0, score_str: 'Draw', white_win_prob: 0.5, normalized: 0.0 };
            if (chessInstance.isCheckmate()) {
              const loser = chessInstance.turn() === 'w' ? 'White' : 'Black';
              reason = `Checkmate — ${loser === 'White' ? 'Black' : 'White'} wins`;
              finalEval = loser === 'White' ? 'B' : 'W';
              finalEvalCanonical = { type: 'mate', value: 0, score_str: loser === 'White' ? '-M0' : 'M0', white_win_prob: loser === 'White' ? 0.0 : 1.0, normalized: loser === 'White' ? -10.0 : 10.0 };
            } else if (chessInstance.isDraw()) {
              reason = chessInstance.isStalemate() ? "Stalemate — Draw" : "Draw";
              finalEval = 'Draw';
            }
            if (newHistory.length > 0) newHistory[newHistory.length - 1] = { ...newHistory[newHistory.length - 1], eval: finalEval, eval_canonical: finalEvalCanonical };
            setHistory(newHistory); setCurrentIndex(newHistory.length - 1);
            setTerminalResult(reason); setEvaluation(finalEval); setEvaluationCanonical(finalEvalCanonical);
            setBestMove(null); setSecondBestMove(null); setPv([]); setPvFen(newFen); setLiveDepth(0); setLiveNps(0);
          } else {
            setHistory(newHistory); setCurrentIndex(newHistory.length - 1);
            triggerAnalysis(newFen, newHistory, newHistory.length - 1);
          }
        }
      } catch (err) {
        console.warn('Invalid promotion move:', err);
      }
    }
  }, [pendingPromotion, fen, history, currentIndex, exploredFen, previewIndex, getLegalDests, triggerAnalysis, playMoveSound]);

  // Called when user clicks away from the promotion picker — revert the visual pawn move
  const handlePromotionCancel = useCallback(() => {
    setPendingPromotion(null);
    // Snap Chessground back to the current FEN (reverting the piece the user dragged)
    snapBoardRef.current?.();
  }, []);


  // Load FEN

  const handleLoadFen = (targetFen: string) => {
    positionSourceRef.current = 'fen_import';
    try {
      const chessInstance = new Chess(targetFen);
      chessRef.current = chessInstance;
      setFen(chessInstance.fen());
      setLegalDests(getLegalDests(chessInstance));
      setLastMove(null);
      setHistory([]);
      setCurrentIndex(-1);
      setStats(null);
      setGameHeaders({});
      setIsReviewMode(false);
      setIsGameLoaded(true); // FEN loaded, we can review it (even if empty, is reviewable)
      setBestMove(null);
      setSecondBestMove(null);
      setPv([]);
      setPvFen(chessInstance.fen());
      setEvaluation('+0.35');
      setEvaluationCanonical({
        type: 'cp',
        value: 35,
        score_str: '+0.35',
        white_win_prob: 0.5498,
        normalized: 0.35
      });
      setOpeningName('');
      setOpeningEco('');
      setOpeningVariation('');
      setOpeningStatus('Book');
      triggerAnalysis(chessInstance.fen(), [], -1);
    } catch (err) {
      alert('Invalid FEN string.');
    }
  };

  // Load PGN
  const handleLoadPgn = (pgnText: string) => {
    positionSourceRef.current = 'pgn_import';
    try {
      const chessInstance = new Chess();
      chessInstance.loadPgn(pgnText);
      
      const headers = chessInstance.header();
      setGameHeaders(headers);

      const chessHistory = chessInstance.history({ verbose: true });
      const parsedMoves: MoveItem[] = [];
      
      // Re-walk to construct MoveItems with correct fens
      const walkChess = new Chess();
      chessHistory.forEach((move, i) => {
        const fenBefore = walkChess.fen();
        walkChess.move(move.san);
        
        let moveEval: string | undefined = undefined;
        let moveEvalCanonical: CanonicalEval | undefined = undefined;
        
        // If this is the final move and it results in game over, set terminal evaluation (Phase 3)
        if (i === chessHistory.length - 1 && walkChess.isGameOver()) {
          if (walkChess.isCheckmate()) {
            const loser = walkChess.turn() === 'w' ? 'White' : 'Black';
            moveEval = loser === 'White' ? 'B' : 'W';
            moveEvalCanonical = {
              type: 'mate',
              value: 0,
              score_str: loser === 'White' ? '-M0' : 'M0',
              white_win_prob: loser === 'White' ? 0.0 : 1.0,
              normalized: loser === 'White' ? -10.0 : 10.0
            };
          } else if (walkChess.isDraw()) {
            moveEval = 'Draw';
            moveEvalCanonical = {
              type: 'cp',
              value: 0,
              score_str: 'Draw',
              white_win_prob: 0.5,
              normalized: 0.0
            };
          }
        }

        parsedMoves.push({
          move_number: Math.floor(i / 2) + 1,
          color: move.color === 'w' ? 'white' : 'black',
          san: move.san,
          uci: move.from + move.to,
          fen_before: fenBefore,
          fen_after: walkChess.fen(),
          eval: moveEval,
          eval_canonical: moveEvalCanonical
        });
      });
      
      chessRef.current = chessInstance;
      const finalFen = chessInstance.fen();
      setFen(finalFen);
      setLegalDests(getLegalDests(chessInstance));
      setLastMove(null);
      setHistory(parsedMoves);
      setCurrentIndex(parsedMoves.length - 1);
      setStats(null);
      setIsReviewMode(false);
      setIsGameLoaded(parsedMoves.length > 0);
      setBestMove(null);
      setSecondBestMove(null);
      setPv([]);
      setOpeningName('');
      setOpeningEco('');
      setOpeningVariation('');
      setOpeningStatus('Book');
      
      // Determine terminalResult on load (Phase 4 / Gap 3)
      let terminationReason: string | null = null;
      if (chessInstance.isGameOver()) {
        let reason = "Game Over";
        if (chessInstance.isCheckmate()) {
          const loser = chessInstance.turn() === 'w' ? 'White' : 'Black';
          const winner = loser === 'White' ? 'Black' : 'White';
          reason = `Checkmate — ${winner} wins`;
        } else if (chessInstance.isDraw()) {
          if (chessInstance.isStalemate()) {
            reason = "Stalemate — Draw";
          } else {
            reason = "Draw";
          }
        }
        terminationReason = reason;
      } else if (headers.Result && headers.Result !== '*') {
        if (headers.Result === '1-0') {
          terminationReason = 'White wins (' + (headers.Termination || '1-0') + ')';
        } else if (headers.Result === '0-1') {
          terminationReason = 'Black wins (' + (headers.Termination || '0-1') + ')';
        } else if (headers.Result === '1/2-1/2') {
          terminationReason = 'Draw (' + (headers.Termination || '1/2-1/2') + ')';
        }
      }
      setTerminalResult(terminationReason);
      
      // Trigger analysis at the final position with all moves
      triggerAnalysis(finalFen, parsedMoves, parsedMoves.length - 1);
    } catch (err) {
      alert('Invalid PGN string.');
    }
  };

  // Reset Board completely
  const handleResetBoard = () => {
    positionSourceRef.current = 'reset';
    const chessInstance = new Chess();
    chessRef.current = chessInstance;
    setFen(chessInstance.fen());
    setOrientation('white');
    setHistory([]);
    setCurrentIndex(-1);
    setPreviewIndex(null);
    setExploredFen(null);
    setExploredLastMove(null);
    setExploredLegalDests(new Map());
    exploredFenRef.current = null;
    setBestMove(null);
    setSecondBestMove(null);
    setPv([]);
    setPvFen(chessInstance.fen());
    setLastMove(null);
    setEvaluation('+0.35');
    setEvaluationCanonical({
      type: 'cp',
      value: 35,
      score_str: '+0.35',
      white_win_prob: 0.5498,
      normalized: 0.35
    });
    setOpeningName('');
    setOpeningEco('');
    setOpeningVariation('');
    setOpeningStatus('Book');
    setStats(null);
    setGameHeaders({});
    setIsReviewMode(false);
    setIsGameLoaded(false);
    setIsReviewing(false);
    setReviewProgress(0);
    setLegalDests(getLegalDests(chessInstance));

    // Clear local cache for this session
    localAnalysisCache.current.clear();
    
    // Trigger fresh analysis on starting position
    triggerAnalysis(chessInstance.fen(), [], -1);
  };

  // Flip board orientation
  const handleFlipBoard = () => {
    setOrientation((o) => (o === 'white' ? 'black' : 'white'));
  };

  // Run full game analysis review
  const handleReviewGame = async () => {
    if (!isGameLoaded || isReviewing) return;
    setIsReviewing(true);
    setReviewProgress(10); // Start progress bar

    try {
      const apiUrl = getApiUrl();
      
      setReviewProgress(30);

      let payload: any = {};
      if (history.length > 0) {
        // Rebuild a clean PGN string from our history
        const startFen = history[0].fen_before || fen;
        const tempChess = new Chess(startFen);
        history.forEach((m) => tempChess.move(m.san));
        payload = { pgn: tempChess.pgn() };
      } else {
        payload = { fen: fen };
      }

      const res = await fetch(`${apiUrl}/api/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      setReviewProgress(75);
      const reviewRes = await res.json();
      setReviewProgress(90);

      if (reviewRes.success) {
        // 1. Populate classifications and openings in history
        const reviewedMoves: MoveItem[] = reviewRes.moves || [];
        const updatedHistory = history.map((h, idx) => {
          const rev = reviewedMoves[idx];
          return rev ? { 
            ...h, 
            classification: rev.classification, 
            reasons: (rev as any).reasons, 
            eval: rev.eval, 
            eval_canonical: (rev as any).eval_canonical,
            opening: rev.opening, 
            diagnostics: (rev as any).diagnostics 
          } : h;
        });
        
        setHistory(updatedHistory);
        setIsReviewMode(true); // Lock the board to read-only since review has completed

        // Reconstruct full list of FENs of the game locally using the fresh updatedHistory
        const startFen = updatedHistory[0]?.fen_before || fen;
        const fensList = [startFen];
        updatedHistory.forEach((m) => fensList.push(m.fen_after));

        // 2. Cache all evaluations locally
        const evalsList: any[] = reviewRes.evaluations || [];
        evalsList.forEach((ev, idx) => {
          const targetFen = fensList[idx];
          if (!targetFen) return;
          const epdKey = targetFen.split(' ').slice(0, 4).join(' ');
          localAnalysisCache.current.set(epdKey, {
            fen: targetFen,
            depth: ev.depth,
            score: ev.score,
            bestMove: ev.best_move,
            secondBestMove: (ev.second_best_move && ev.second_best_move !== ev.best_move) ? ev.second_best_move : null,
            pv: ev.pv || [],
            evalCanonical: ev.eval_canonical,
          });
        });

        // 3. Set opening name and variation
        if (reviewRes.opening) {
          const op = reviewRes.opening;
          // Extract variation
          let opName = op.name || '';
          let opVar = op.variation || '';
          if (opName.includes(': ')) {
            const parts = opName.split(': ', 2);
            opName = parts[0];
            opVar = parts[1];
          }
          setOpeningName(opName);
          setOpeningEco(op.eco || '');
          setOpeningVariation(opVar);
          setOpeningStatus(op.status || 'Book');
        }

        // 4. Set game review stats (Phase 4 mapping fix)
        if (reviewRes.stats) {
          setStats(reviewRes.stats);
        } else {
          setStats({
            white: reviewRes.white_stats,
            black: reviewRes.black_stats
          } as any);
        }

        // 5. Select current index to update evaluation & arrows, passing the fresh history explicitly
        if (currentIndex >= 0 && currentIndex < updatedHistory.length) {
          selectPosition(currentIndex, updatedHistory);
        } else {
          selectPosition(-1, updatedHistory);
        }
      }
    } catch (err) {
      console.error('Error reviewing game:', err);
      setNotification('Failed to complete game review.');
    } finally {
      setIsReviewing(false);
      setReviewProgress(100);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return; // Don't trigger shortcuts in text inputs
      }
      
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          if (currentIndex > -1) {
            positionSourceRef.current = 'keyboard_navigation';
            selectPosition(currentIndex - 1);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (currentIndex < history.length - 1) {
            positionSourceRef.current = 'keyboard_navigation';
            selectPosition(currentIndex + 1);
          }
          break;
        case 'ArrowUp':
        case 'Home':
          e.preventDefault();
          positionSourceRef.current = 'keyboard_navigation';
          selectPosition(-1);
          break;
        case 'ArrowDown':
        case 'End':
          e.preventDefault();
          if (history.length) {
            positionSourceRef.current = 'keyboard_navigation';
            selectPosition(history.length - 1);
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, history, selectPosition]);

  const handlePlayPvMove = useCallback((_targetUci: string, pvIndex: number) => {
    positionSourceRef.current = 'pv_navigation';
    try {
      const activeIdx = previewIndex !== null ? previewIndex : currentIndex;
      const activeMove = activeIdx >= 0 && activeIdx < history.length ? history[activeIdx] : null;
      const baseFen = (isReviewMode && exploredFen !== null)
        ? exploredFen
        : (isReviewMode ? (activeIdx === -1 ? (history[0]?.fen_before || new Chess().fen()) : (activeMove?.fen_after || fen)) : fen);

      const tempChess = new Chess(baseFen);
      let lastUci = '';
      // Play moves in PV up to pvIndex
      for (let i = 0; i <= pvIndex; i++) {
        const uci = pv[i];
        if (!uci) break;
        const from = uci.slice(0, 2);
        const to = uci.slice(2, 4);
        const promo = uci.length > 4 ? uci[4] : undefined;
        tempChess.move({ from, to, promotion: promo });
        lastUci = uci;
      }
      
      const newFen = tempChess.fen();
      const movesPlayed = tempChess.history({ verbose: true });
      const lastPlayed = movesPlayed[movesPlayed.length - 1];
      if (lastPlayed) {
        playMoveSound(lastPlayed.san);
      }
      
      if (isReviewMode) {
        exploredFenRef.current = newFen;
        setExploredFen(newFen);
        if (lastUci) {
          setExploredLastMove([lastUci.slice(0, 2), lastUci.slice(2, 4)]);
        }
        setExploredLegalDests(getLegalDests(tempChess));
        triggerAnalysis(newFen, undefined, undefined, true);
      } else {
        setFen(newFen);
        setLegalDests(getLegalDests(tempChess));
        if (lastUci) {
          setLastMove([lastUci.slice(0, 2), lastUci.slice(2, 4)]);
        }
        triggerAnalysis(newFen);
      }
    } catch (err) {
      console.warn('Failed to play PV move:', err);
    }
  }, [fen, pv, getLegalDests, triggerAnalysis, isReviewMode, exploredFen, previewIndex, history, currentIndex]);

  // Compute preview-active variables for real-time hover previews of analysed positions
  const activeIndex = previewIndex !== null ? previewIndex : currentIndex;
  const activeMove = activeIndex >= 0 && activeIndex < history.length ? history[activeIndex] : null;
  const activeFen = activeIndex === -1 
    ? (history[0]?.fen_before || fen) 
    : (activeMove?.fen_after || fen);
  const activeEval = activeIndex === -1 
    ? evaluation 
    : (activeMove?.eval || evaluation);
  
  const activeEvalCanonical = activeIndex === -1
    ? (evaluationCanonical || { type: 'cp' as const, value: 35, score_str: '+0.35', white_win_prob: 0.5498, normalized: 0.35 })
    : (activeMove?.eval_canonical || parseToCanonicalEval(activeEval));
  
  const activeLastMove = activeMove && activeMove.uci 
    ? [activeMove.uci.slice(0, 2), activeMove.uci.slice(2, 4)] as [string, string]
    : (previewIndex !== null ? null : lastMove);
    
  const activeClassification = activeMove ? activeMove.classification : null;
  const activeClassificationUci = activeMove ? activeMove.uci : null;

  // Resolve current active board representation (Immutable Review vs Transient Exploration)
  const boardFen = exploredFen !== null ? exploredFen : activeFen;
  const boardEvalCanonical = exploredFen !== null ? evaluationCanonical : activeEvalCanonical;
  const boardLastMove = exploredFen !== null ? exploredLastMove : activeLastMove;
  const boardClassification = exploredFen !== null ? null : activeClassification;
  const boardClassificationUci = exploredFen !== null ? null : activeClassificationUci;
  const boardLegalDests = exploredFen !== null ? exploredLegalDests : legalDests;

  // ── Single Source of Truth: pvFen gate ──────────────────────────────────────
  // Only pass pv/bestMove/secondBestMove to the board when pvFen matches boardFen.
  // This eliminates the "ghost arrows" bug where the PV from position A appears
  // momentarily over position B while the new engine search hasn't resolved yet.
  const boardFenEpd = boardFen.split(' ').slice(0, 4).join(' ');
  const pvFenEpd = pvFen.split(' ').slice(0, 4).join(' ');
  const pvMatchesBoard = boardFenEpd === pvFenEpd;

  // ── DEV SYNC ASSERTIONS ─────────────────────────────────────────────────────
  // In development, warn when any subsystem references a stale FEN.
  if (import.meta.env.DEV && exploredFen !== null) {
    // The engine should be analysing the explored FEN.
    const engineKey = expectedFenRef.current.split(' ').slice(0, 4).join(' ');
    const exploredKey = exploredFen.split(' ').slice(0, 4).join(' ');
    if (engineKey && engineKey !== exploredKey) {
      console.warn(
        `[SYNC_ASSERT] Engine is analysing a different FEN than the exploration board!\n` +
        `  Board (explored): ${exploredKey}\n` +
        `  Engine (expected): ${engineKey}`
      );
    }
    if (pvFen && !pvMatchesBoard) {
      console.warn(
        `[SYNC_ASSERT] PV/arrows belong to a different position than the board!\n` +
        `  Board FEN EPD: ${boardFenEpd}\n` +
        `  PV FEN EPD:    ${pvFenEpd}`
      );
    }
  }

  let activeTurnColor: 'white' | 'black' = 'white';
  try {
    activeTurnColor = new Chess(boardFen).turn() === 'w' ? 'white' : 'black';
  } catch {
    activeTurnColor = orientation;
  }

  if (isMobile && mobileView === 'landing') {
    return (
      <div className="flex-1 w-full min-h-screen bg-[#111111] text-white flex flex-col items-center justify-center px-6 py-12 select-none relative overflow-y-auto">
        {/* Ambient Gold Glow behind logo */}
        <div className="absolute top-[20%] w-48 h-48 rounded-full bg-[radial-gradient(circle,rgba(197,160,89,0.06)_0%,transparent_70%)] pointer-events-none" />
        
        {/* Logo and Wordmark */}
        <div className="flex flex-col items-center gap-3 mb-10 text-center">
          <img 
            src="/logo.png" 
            alt="MouseSlip Logo" 
            className="w-20 h-20 object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)]" 
          />
          <div>
            <h1 className="text-3xl font-black tracking-wider text-white m-0">MouseSlip</h1>
            <p className="text-xs text-[#c5a059] font-black tracking-[0.25em] uppercase mt-1">Chess Analysis</p>
          </div>
        </div>

        {/* Option Cards Stack */}
        <div className="w-full max-w-sm flex flex-col gap-4">
          {/* Card 1: New Analysis */}
          <button
            onClick={() => {
              handleResetBoard();
              setMobileView('board');
              setControlsExpanded(false);
            }}
            className="w-full text-left p-4.5 rounded-xl bg-[#181818]/80 hover:bg-[#202020]/90 border border-white/5 hover:border-[#c5a059]/40 active:border-[#c5a059]/60 transition-all flex items-center gap-4.5 shadow-lg group relative overflow-hidden cursor-pointer"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-[#c5a059]/0 to-[#c5a059]/[0.02] opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="bg-[#c5a059]/10 p-2.5 rounded-xl text-[#c5a059] group-hover:scale-[1.03] transition-transform">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <div>
              <p className="font-extrabold text-sm text-white group-hover:text-[#c5a059] transition-colors">New Analysis</p>
              <p className="text-[11px] text-white/45 mt-0.5">Start from the initial position</p>
            </div>
          </button>

          {/* Card 2: Paste PGN / FEN */}
          <button
            onClick={() => {
              setControlPanelTab('pgn');
              setControlsExpanded(true);
              setMobileView('board');
            }}
            className="w-full text-left p-4.5 rounded-xl bg-[#181818]/80 hover:bg-[#202020]/90 border border-white/5 hover:border-[#c5a059]/40 active:border-[#c5a059]/60 transition-all flex items-center gap-4.5 shadow-lg group relative overflow-hidden cursor-pointer"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-[#c5a059]/0 to-[#c5a059]/[0.02] opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="bg-[#c5a059]/10 p-2.5 rounded-xl text-[#c5a059] group-hover:scale-[1.03] transition-transform">
              <Clipboard className="w-5 h-5" />
            </div>
            <div>
              <p className="font-extrabold text-sm text-white group-hover:text-[#c5a059] transition-colors">Paste PGN / FEN</p>
              <p className="text-[11px] text-white/45 mt-0.5">Load a game or position</p>
            </div>
          </button>

          {/* Card 3: Import Games */}
          <button
            onClick={() => {
              setControlPanelTab('chesscom');
              setControlsExpanded(true);
              setMobileView('board');
            }}
            className="w-full text-left p-4.5 rounded-xl bg-[#181818]/80 hover:bg-[#202020]/90 border border-white/5 hover:border-[#c5a059]/40 active:border-[#c5a059]/60 transition-all flex items-center gap-4.5 shadow-lg group relative overflow-hidden cursor-pointer"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-[#c5a059]/0 to-[#c5a059]/[0.02] opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="bg-[#c5a059]/10 p-2.5 rounded-xl text-[#c5a059] group-hover:scale-[1.03] transition-transform">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <p className="font-extrabold text-sm text-white group-hover:text-[#c5a059] transition-colors">Import Games</p>
              <p className="text-[11px] text-white/45 mt-0.5">Browse Chess.com history</p>
            </div>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 w-full min-h-screen bg-[#0A0A0C] text-[#EDEAE3] flex flex-col justify-between select-none">
      {/* Mobile Header Bar */}
      {isMobile && (
        <header className="w-full bg-[#0F0F11] border-b border-[#C9A356]/20 py-3.5 px-6 flex items-center justify-between z-40 select-none">
          <button 
            onClick={() => setMobileView('landing')}
            className="text-[#C9A356] hover:text-[#EDEAE3] transition-colors text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer bg-[#C9A356]/08 hover:bg-[#C9A356]/15 border border-[#C9A356]/25 px-3 py-1.5 rounded-full"
          >
            <span>← Landing</span>
          </button>
          <div className="flex items-center gap-2">
            <img src="/logo.png" className="w-6 h-6 object-contain" />
            <span className="text-sm font-bold tracking-wider text-[#EDEAE3]">MouseSlip</span>
          </div>
          <div className="w-20" /> {/* Spacer */}
        </header>
      )}
      {/* Main Body Layout */}
      <main className="flex-1 w-full max-w-[1880px] mx-auto px-6 py-6 flex flex-col lg:flex-row items-stretch justify-center gap-8">
        
        {/* Left Control Panel (Fixed Spacious Width) */}
        <div className="w-full lg:w-[330px] shrink-0 flex flex-col gap-4 order-3 lg:order-1">
          {isMobile ? (
            <div className="flex flex-col gap-3 w-full">
              <button
                onClick={() => setControlsExpanded(prev => !prev)}
                className="w-full py-3.5 px-4 bg-[#181818] hover:bg-[#202020] border border-[#c5a059]/25 rounded-xl flex items-center justify-between text-xs font-bold text-white shadow-md transition-all active:scale-[0.99] cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-[#c5a059]" />
                  <span>Analysis Controls & Settings</span>
                </span>
                {controlsExpanded ? <ChevronUp className="w-4 h-4 text-[#c5a059]" /> : <ChevronDown className="w-4 h-4 text-[#c5a059]" />}
              </button>
              
              <AnimatePresence>
                {controlsExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="flex flex-col gap-4 w-full overflow-hidden"
                  >
                    <ControlPanel
                      onLoadPgn={handleLoadPgn}
                      onLoadFen={handleLoadFen}
                      onLoadChessComGame={handleLoadPgn}
                      onResetBoard={handleResetBoard}
                      onFlipBoard={handleFlipBoard}
                      onReviewGame={handleReviewGame}
                      isGameLoaded={isGameLoaded}
                      isReviewing={isReviewing}
                      reviewProgress={reviewProgress}
                      settings={settings}
                      onUpdateSettings={setSettings}
                      pv={pv}
                      fen={pvFen || fen}
                      pgn={(() => {
                        if (history.length === 0) return fen;
                        try {
                          const tempChess = new Chess();
                          history.forEach((m) => tempChess.move(m.san));
                          return tempChess.pgn();
                        } catch { return fen; }
                      })()}
                      onPlayPvMove={handlePlayPvMove}
                      liveDepth={liveDepth}
                      liveNps={liveNps}
                      engineStatus={engineStatus}
                      isConnected={isConnected}
                      activeTab={controlPanelTab}
                      setActiveTab={setControlPanelTab}
                    />
                    <TelemetryPanel
                      status={engineStatus}
                      genId={positionGenIdRef.current}
                      moveNumber={currentIndex >= 0 ? Math.floor(currentIndex / 2) + 1 : 0}
                      fen={fen}
                      searchStart={searchStart}
                      searchEnd={searchEnd}
                      depth={liveDepth}
                      targetDepth={settings.depth}
                      nps={liveNps}
                      engineLatency={engineLatency}
                      wsRtt={wsRtt}
                      enginesActive={poolTelemetry.engines_in_use}
                      enginesAvailable={poolTelemetry.engines_available}
                      activeTasks={poolTelemetry.active_searches}
                      cancelledTasks={poolTelemetry.cancelled_searches}
                      completedTasks={poolTelemetry.completed_searches}
                      queueWaitTime={poolTelemetry.avg_queue_wait_time}
                      avgDepthPerSec={liveDepth / (engineLatency > 0 ? (performance.now() - searchStartTimeRef.current) / 1000 : 1)}
                      evalUpdatesCount={evalUpdatesCount}
                      pvUpdatesCount={pvUpdatesCount}
                      arrowUpdatesCount={arrowUpdatesCount}
                      openingUpdatesCount={openingUpdatesCount}
                      graphUpdatesCount={graphUpdatesCount}
                      renderCount={renderCountRef.current}
                      isSynced={engineStatus !== 'Error'}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <>
              <ControlPanel
                onLoadPgn={handleLoadPgn}
                onLoadFen={handleLoadFen}
                onLoadChessComGame={handleLoadPgn}
                onResetBoard={handleResetBoard}
                onFlipBoard={handleFlipBoard}
                onReviewGame={handleReviewGame}
                isGameLoaded={isGameLoaded}
                isReviewing={isReviewing}
                reviewProgress={reviewProgress}
                settings={settings}
                onUpdateSettings={setSettings}
                pv={pv}
                fen={pvFen || fen}
                pgn={(() => {
                  if (history.length === 0) return fen;
                  try {
                    const tempChess = new Chess();
                    history.forEach((m) => tempChess.move(m.san));
                    return tempChess.pgn();
                  } catch { return fen; }
                })()}
                onPlayPvMove={handlePlayPvMove}
                liveDepth={liveDepth}
                liveNps={liveNps}
                engineStatus={engineStatus}
                isConnected={isConnected}
                activeTab={controlPanelTab}
                setActiveTab={setControlPanelTab}
              />
              <TelemetryPanel
                status={engineStatus}
                genId={positionGenIdRef.current}
                moveNumber={currentIndex >= 0 ? Math.floor(currentIndex / 2) + 1 : 0}
                fen={fen}
                searchStart={searchStart}
                searchEnd={searchEnd}
                depth={liveDepth}
                targetDepth={settings.depth}
                nps={liveNps}
                engineLatency={engineLatency}
                wsRtt={wsRtt}
                enginesActive={poolTelemetry.engines_in_use}
                enginesAvailable={poolTelemetry.engines_available}
                activeTasks={poolTelemetry.active_searches}
                cancelledTasks={poolTelemetry.cancelled_searches}
                completedTasks={poolTelemetry.completed_searches}
                queueWaitTime={poolTelemetry.avg_queue_wait_time}
                avgDepthPerSec={liveDepth / (engineLatency > 0 ? (performance.now() - searchStartTimeRef.current) / 1000 : 1)}
                evalUpdatesCount={evalUpdatesCount}
                pvUpdatesCount={pvUpdatesCount}
                arrowUpdatesCount={arrowUpdatesCount}
                openingUpdatesCount={openingUpdatesCount}
                graphUpdatesCount={graphUpdatesCount}
                renderCount={renderCountRef.current}
                isSynced={engineStatus !== 'Error'}
              />
            </>
          )}
        </div>

        {/* Center Chessboard + Evaluation Bar */}
        <div className="flex-1 flex flex-col items-center justify-start gap-5 min-w-0 order-1 lg:order-2">
          
          {/* Centered Branding Above Board */}
          {!isMobile && (
            <div 
              className="flex flex-col items-center justify-center gap-2 mb-2 select-none cursor-pointer relative"
              onDoubleClick={() => setDebugMode((d) => !d)}
              title="Double-click to toggle Developer Diagnostics"
            >
              {/* Ambient Gold Glow behind logo */}
              <div className="absolute w-24 h-24 rounded-full bg-[radial-gradient(circle,rgba(201,163,86,0.07)_0%,transparent_70%)] -z-10 pointer-events-none" />
              <img 
                src="/logo.png" 
                alt="MouseSlip Logo" 
                className="w-14 h-14 object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.65)]" 
              />
              <div className="text-center">
                <h1 className="text-[22px] font-black tracking-wide text-[#EDEAE3] m-0 leading-none italic" style={{ fontFamily: '"Fraunces", Georgia, serif', fontVariationSettings: '"opsz" 72' }}>MouseSlip</h1>
                <p className="text-[9.5px] text-[#C9A356] font-semibold tracking-[0.22em] uppercase mt-1 leading-none">Chess Analysis</p>
              </div>
            </div>
          )}

          {/* Player Info and Chessboard Section */}
          {(() => {
            const { whiteCaptured, blackCaptured, whiteLead, blackLead } = getCapturedPieces(boardFen);
            
            const topPlayerName = orientation === 'white' 
              ? (gameHeaders.Black || 'Black Player') 
              : (gameHeaders.White || 'White Player');
            const topPlayerRating = orientation === 'white' ? gameHeaders.BlackElo : gameHeaders.WhiteElo;
            const topCaptured = orientation === 'white' ? blackCaptured : whiteCaptured;
            const topLead = orientation === 'white' ? blackLead : whiteLead;

            const bottomPlayerName = orientation === 'white' 
              ? (gameHeaders.White || 'White Player') 
              : (gameHeaders.Black || 'Black Player');
            const bottomPlayerRating = orientation === 'white' ? gameHeaders.WhiteElo : gameHeaders.BlackElo;
            const bottomCaptured = orientation === 'white' ? whiteCaptured : blackCaptured;
            const bottomLead = orientation === 'white' ? whiteLead : blackLead;

            return (
              <div className="w-full max-w-[min(760px,62vh,100%)] flex flex-col items-center select-none">
                {/* Top Player Info Card */}
                <div className="w-full flex items-center justify-between py-2 px-3 bg-[#151517] border-x border-t border-[#C9A356]/20 rounded-t-xl text-xs font-semibold">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full border border-white/15 ${orientation === 'white' ? 'bg-[#0A0A0C]' : 'bg-[#EDEAE3]'}`} />
                    <span className="font-semibold text-[#EDEAE3]">{topPlayerName}</span>
                    {topPlayerRating && <span className="text-[#5A5A57] font-mono font-semibold" style={{ fontFamily: '"JetBrains Mono", monospace' }}>({topPlayerRating})</span>}
                  </div>
                  <div className="flex items-center gap-0.5 text-xs font-mono font-extrabold tracking-tight">
                    {topCaptured.map((symbol, idx) => (
                      <span key={idx} className="text-[#5A5A57] text-[13px] leading-none">{symbol}</span>
                    ))}
                    {topLead > 0 && <span className="text-[#7A8471] font-bold ml-1.5 text-[11px]" style={{ fontFamily: '"JetBrains Mono", monospace' }}>+{topLead}</span>}
                  </div>
                </div>
 
                {/* Exploration Banner — lives BETWEEN the top player card and the board.
                    Never overlaps pieces, squares, arrows, or coordinates. */}
                <AnimatePresence>
                  {exploredFen !== null && (
                    <motion.div
                      key="exploration-banner"
                      initial={{ opacity: 0, y: -6, scaleY: 0.85 }}
                      animate={{ opacity: 1, y: 0, scaleY: 1 }}
                      exit={{ opacity: 0, y: -4, scaleY: 0.9 }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                      className="w-full bg-[#0F0F11] border-x border-[#C9A356]/20 py-2 px-4 flex items-center justify-center"
                    >
                      <div className="flex items-center gap-2.5 bg-[#C9A356]/10 border border-[#C9A356]/30 px-4 py-1.5 rounded-full shadow-[0_2px_12px_rgba(201,163,86,0.14)]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#C9A356] animate-pulse shrink-0" />
                        <span className="text-[10px] font-semibold tracking-widest uppercase text-[#C9A356]" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                          {explorationTerminalResult
                            ? (explorationTerminalResult.toLowerCase().includes('checkmate')
                              ? `🏆 ${explorationTerminalResult}`
                              : explorationTerminalResult)
                            : 'Exploring Alternative Line'
                          }
                        </span>
                        <button
                          onClick={() => {
                            exploredFenRef.current = null;
                            isExplorationMoveRef.current = false;
                            setExploredFen(null);
                            setExploredLastMove(null);
                            setExploredLegalDests(new Map());
                            setExplorationTerminalResult(null);
                            // Restore engine search on the original reviewed position
                            const activeIdx = previewIndex !== null ? previewIndex : currentIndex;
                            const activeMoveItem = activeIdx >= 0 && activeIdx < history.length ? history[activeIdx] : null;
                            const activeOriginalFen = activeIdx === -1
                              ? (history[0]?.fen_before || new Chess().fen())
                              : (activeMoveItem?.fen_after || fen);
                            triggerAnalysis(activeOriginalFen);
                          }}
                          className="ml-2 text-[#C9A356]/70 hover:text-[#EDEAE3] transition-colors cursor-pointer text-[9px] font-semibold uppercase tracking-wider bg-white/[0.06] hover:bg-[#C9A356]/20 border border-white/10 hover:border-[#C9A356]/45 px-2.5 py-0.5 rounded-full"
                        >
                          Exit
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Unified Board Container */}
                <div className="w-full bg-[#151517] border-x border-t border-[#C9A356]/18 flex items-center justify-center p-6 pl-14 overflow-hidden shadow-[0_25px_60px_rgba(0,0,0,0.8),0_0_30px_rgba(201,163,86,0.05)]">
                  <div className="relative aspect-square w-full mx-auto">
                    <Chessboard
                      fen={boardFen}
                      orientation={orientation}
                      bestMove={previewIndex !== null || !pvMatchesBoard ? null : bestMove}
                      secondBestMove={previewIndex !== null || !pvMatchesBoard || !settings.showSecondBestMove ? null : secondBestMove}
                      pv={previewIndex !== null || !pvMatchesBoard ? [] : pv}
                      lastMove={boardLastMove}
                      turnColor={activeTurnColor}
                      onMove={handleBoardMove}
                      legalDests={boardLegalDests}
                      readOnly={isReviewing}
                      onManualMoveAttempt={() => setNotification("Game Review is currently running. Please wait for it to finish before exploring alternative lines.")}
                      scoreCanonical={boardEvalCanonical}
                      classification={boardClassification}
                      classificationUci={boardClassificationUci}
                      onBoardSizeChange={setBoardSize}
                      snapBoardRef={snapBoardRef}
                    />

                    {/* Promotion Picker Overlay */}
                    {pendingPromotion && (
                      <PromotionPicker
                        onSelect={handlePromotionSelect}
                        onCancel={handlePromotionCancel}
                        boardSize={boardSize}
                      />
                    )}
                  </div>
                </div>


                {/* Bottom Player Info Card */}
                <div className="w-full flex items-center justify-between py-2 px-3 bg-[#151517] border border-[#C9A356]/18 rounded-b-xl text-xs font-semibold">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full border border-white/15 ${orientation === 'white' ? 'bg-[#EDEAE3]' : 'bg-[#0A0A0C]'}`} />
                    <span className="font-semibold text-[#EDEAE3]">{bottomPlayerName}</span>
                    {bottomPlayerRating && <span className="text-[#5A5A57] font-semibold" style={{ fontFamily: '"JetBrains Mono", monospace' }}>({bottomPlayerRating})</span>}
                  </div>
                  <div className="flex items-center gap-0.5 text-xs font-extrabold tracking-tight">
                    {bottomCaptured.map((symbol, idx) => (
                      <span key={idx} className="text-[#5A5A57] text-[13px] leading-none">{symbol}</span>
                    ))}
                    {bottomLead > 0 && <span className="text-[#7A8471] font-bold ml-1.5 text-[11px]" style={{ fontFamily: '"JetBrains Mono", monospace' }}>+{bottomLead}</span>}
                  </div>
                </div>

                {/* Dedicated Game Result Banner */}
                {terminalResult && (
                  <div 
                    className="w-full mt-3.5 py-3 bg-[#0F0F11]/95 border border-[#C9A356]/30 rounded-xl flex items-center justify-between text-xs font-semibold text-[#EDEAE3] shadow-[0_8px_32px_rgba(0,0,0,0.5)] animate-slide-up-fade backdrop-blur-md"
                    style={{ paddingLeft: '56px', paddingRight: '16px' }}
                  >
                    <div className="flex-1 flex items-center justify-center gap-2">
                      <span className="tracking-tight text-[#EDEAE3]/90" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                        {terminalResult.toLowerCase().includes("checkmate") 
                          ? `🏆 Checkmate! ${terminalResult.toLowerCase().includes("white wins") ? "White wins." : "Black wins."}`
                          : terminalResult
                        }
                      </span>
                    </div>
                    <Trophy className="w-4 h-4 text-[#C9A356] shrink-0 opacity-85" />
                  </div>
                )}


              </div>
            );
          })()}

          {/* Move Classification Popup */}
          <AnimatePresence mode="wait">
            {stats && currentIndex >= 0 && history[currentIndex]?.classification && (
              <MoveClassificationPopup
                classification={history[currentIndex].classification}
                reasons={history[currentIndex].reasons}
              />
            )}
          </AnimatePresence>

          {/* Developer Review Diagnostics Panel */}
          {debugMode && stats && currentIndex >= 0 && history[currentIndex] && (
            <div className="w-full max-w-[min(760px,62vh,100%)] p-4 bg-black/55 backdrop-blur-md border border-red-500/20 rounded-xl font-mono text-[10px] text-red-400/90 space-y-2 shadow-inner mt-2.5 select-text">
              <div className="text-xs font-black text-red-500 uppercase tracking-widest border-b border-red-500/10 pb-1 flex justify-between select-none">
                <span>DEVELOPER DIAGNOSTICS</span>
                <span className="text-[9px] bg-red-900/30 px-1.5 py-0.5 rounded text-red-400">ACTIVE</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-white/90">
                <div><span className="text-red-400/60 font-bold">Move Number:</span> {currentIndex + 1}</div>
                <div><span className="text-red-400/60 font-bold">SAN / UCI:</span> {history[currentIndex].san} / {history[currentIndex].uci}</div>
                <div><span className="text-red-400/60 font-bold">Game Phase:</span> {(history[currentIndex] as any).diagnostics?.game_phase || 'N/A'}</div>
                <div><span className="text-red-400/60 font-bold">Opening State:</span> {(history[currentIndex] as any).diagnostics?.opening_state || 'N/A'}</div>
                
                <div className="col-span-2 border-t border-red-500/5 my-1" />
                
                <div><span className="text-red-400/60 font-bold">Eval Before:</span> {(history[currentIndex] as any).diagnostics?.eval_before || 'N/A'}</div>
                <div><span className="text-red-400/60 font-bold">Eval After:</span> {(history[currentIndex] as any).diagnostics?.eval_after || 'N/A'}</div>
                <div><span className="text-red-400/60 font-bold">Best Move:</span> {(history[currentIndex] as any).diagnostics?.best_move || 'N/A'}</div>
                <div><span className="text-red-400/60 font-bold">Second Best:</span> {(history[currentIndex] as any).diagnostics?.second_best_move || 'N/A'}</div>
                <div><span className="text-red-400/60 font-bold">Third Best:</span> {(history[currentIndex] as any).diagnostics?.third_best_move || 'N/A'}</div>
                <div><span className="text-red-400/60 font-bold">Centipawn Loss:</span> {(history[currentIndex] as any).diagnostics?.cpl || 0}</div>
                
                <div className="col-span-2 border-t border-red-500/5 my-1" />
                
                <div><span className="text-red-400/60 font-bold">Win Prob Before:</span> {typeof (history[currentIndex] as any).diagnostics?.win_before === 'number' ? `${((history[currentIndex] as any).diagnostics.win_before * 100).toFixed(1)}%` : 'N/A'}</div>
                <div><span className="text-red-400/60 font-bold">Win Prob After:</span> {typeof (history[currentIndex] as any).diagnostics?.win_after === 'number' ? `${((history[currentIndex] as any).diagnostics.win_after * 100).toFixed(1)}%` : 'N/A'}</div>
                <div><span className="text-red-400/60 font-bold">Outcome Change:</span> {typeof (history[currentIndex] as any).diagnostics?.win_loss === 'number' ? `${((history[currentIndex] as any).diagnostics.win_loss * 100).toFixed(1)}%` : 'N/A'}</div>
                <div><span className="text-red-400/60 font-bold">Accuracy Contribution:</span> {typeof (history[currentIndex] as any).diagnostics?.accuracy === 'number' ? `${((history[currentIndex] as any).diagnostics.accuracy).toFixed(1)}%` : 'N/A'}</div>
                <div><span className="text-red-400/60 font-bold">Running White Acc:</span> {typeof (history[currentIndex] as any).diagnostics?.running_white_accuracy === 'number' ? `${((history[currentIndex] as any).diagnostics.running_white_accuracy).toFixed(1)}%` : 'N/A'}</div>
                <div><span className="text-red-400/60 font-bold">Running Black Acc:</span> {typeof (history[currentIndex] as any).diagnostics?.running_black_accuracy === 'number' ? `${((history[currentIndex] as any).diagnostics.running_black_accuracy).toFixed(1)}%` : 'N/A'}</div>
                
                <div className="col-span-2 border-t border-red-500/5 my-1" />
                
                <div className="col-span-2"><span className="text-red-400/60 font-bold">Classification:</span> <span className="font-extrabold text-white">{(history[currentIndex] as any).diagnostics?.classification}</span></div>
                <div className="col-span-2"><span className="text-red-400/60 font-bold font-bold">Reasons:</span> {((history[currentIndex] as any).diagnostics?.reasons || []).join('; ')}</div>
              </div>
            </div>
          )}

          {/* Interactive Evaluation Graph */}
          <div className="w-full max-w-[min(760px,62vh,100%)]">
            <EvaluationGraph 
              moves={history}
              currentIndex={currentIndex}
              hoveredIndex={previewIndex}
              onHoverMove={setPreviewIndex}
              onSelectMove={(idx) => {
                positionSourceRef.current = 'review_navigation';
                selectPosition(idx);
              }}
            />
          </div>
        </div>

        {/* Right Moves Panel (Fixed Spacious Width) */}
        <div className="w-full lg:w-[330px] shrink-0 order-2 lg:order-3">
          <MoveList
            moves={history}
            currentIndex={currentIndex}
            hoveredIndex={previewIndex}
            onSelectMove={(idx) => {
              positionSourceRef.current = 'review_navigation';
              selectPosition(idx);
            }}
            openingName={openingName}
            openingEco={openingEco}
            openingVariation={openingVariation}
            openingStatus={openingStatus}
            stats={stats}
            terminalResult={terminalResult}
            isGameLoaded={isGameLoaded}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="py-5 mt-8 border-t border-white/5 bg-[#141414] text-center text-[11px] text-white/40 font-medium tracking-wide">
        <p className="mb-1 select-none flex items-center justify-center gap-1.5">
          <span>Made with</span>
          <span className="inline-flex items-center gap-[4px]">
            <span>♟</span>
            <span>♙</span>
          </span>
          <span>By</span>
          <span className="text-[#c5a059] font-bold">Surya Pranav Pratapam</span>
        </p>
        <p className="select-none">
          LinkedIn &mdash; <a 
            href="https://www.linkedin.com/in/surya-pranav-pratapam-7502b133b/"
            target="_blank" 
            rel="noopener noreferrer"
            className="text-[#3b82f6] hover:text-[#5fa2ff] hover:underline transition-colors duration-250 font-bold select-text"
          >
            Click here
          </a>
        </p>
      </footer>

      {/* Floating Dismissible Toast Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="fixed bottom-4 right-4 z-50 max-w-sm bg-[#1a1a1a]/95 border border-[#c5a059]/30 rounded-xl p-3.5 shadow-2xl flex items-start gap-3 backdrop-blur-md shadow-[0_16px_40px_rgba(0,0,0,0.7)]"
          >
            <div className="bg-[#c5a059]/10 p-1.5 rounded-lg text-[#c5a059] shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex-1 text-xs">
              <p className="text-[#c5a059] font-bold mb-0.5">Analysis Advisory</p>
              <p className="text-white/70 font-medium leading-relaxed font-mono text-[10px]">{notification}</p>
            </div>
            <button 
              onClick={() => setNotification(null)}
              className="text-white/30 hover:text-[#c5a059] transition-colors text-sm font-black leading-none cursor-pointer p-0.5 shrink-0"
            >
              &times;
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
