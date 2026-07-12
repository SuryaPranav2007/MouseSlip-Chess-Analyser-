import { useEffect, useRef, useState, useCallback } from 'react';
import { getWsUrl } from '../config';

export interface CanonicalEval {
  type: 'cp' | 'mate';
  value: number;
  score_str: string;
  white_win_prob: number;
  normalized: number;
}

export interface AnalysisData {
  fen: string;
  depth: number;
  score: string;
  bestMove: string | null;
  secondBestMove?: string | null;
  pv: string[];
  pv2?: string[];
  nps?: number;
  nodes?: number;
  genId?: number;
  evalCanonical?: CanonicalEval;
}

export interface OpeningData {
  eco: string;
  name: string;
  variation: string;
  status: string;
}

interface UseWebSocketProps {
  onAnalysisUpdate: (data: AnalysisData) => void;
  onOpeningUpdate: (data: OpeningData) => void;
  onConnectionChange?: (connected: boolean) => void;
  onConnectionError?: (error: string) => void;
}

export function useWebSocket({
  onAnalysisUpdate,
  onOpeningUpdate,
  onConnectionChange,
  onConnectionError,
}: UseWebSocketProps) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectCountRef = useRef(0);

  // Keep callbacks in refs to avoid reconnecting on reference changes
  const onAnalysisUpdateRef = useRef(onAnalysisUpdate);
  const onOpeningUpdateRef = useRef(onOpeningUpdate);
  const onConnectionChangeRef = useRef(onConnectionChange);
  const onConnectionErrorRef = useRef(onConnectionError);

  useEffect(() => {
    onAnalysisUpdateRef.current = onAnalysisUpdate;
    onOpeningUpdateRef.current = onOpeningUpdate;
    onConnectionChangeRef.current = onConnectionChange;
    onConnectionErrorRef.current = onConnectionError;
  });

  const connect = useCallback(() => {
    // Determine dynamic websocket url
    const wsUrl = `${getWsUrl()}/api/analyze`;

    console.log(`Connecting to WebSocket at ${wsUrl}`);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[FRONTEND] WebSocket connected (state: OPEN)');
      setIsConnected(true);
      reconnectCountRef.current = 0; // Reset reconnect count on success
      if (onConnectionChangeRef.current) onConnectionChangeRef.current(true);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('[FRONTEND] First engine packet received, type:', message.type);
        if (message.type === 'opening') {
          if (onOpeningUpdateRef.current) {
            onOpeningUpdateRef.current({
              eco: message.eco,
              name: message.name,
              variation: message.variation || '',
              status: message.status || 'Book',
              genId: message.gen_id,   // forward gen_id for staleness check
            } as any);
          }
        } else if (message.type === 'analysis' || message.type === 'analysis_cached') {
          if (onAnalysisUpdateRef.current) {
            onAnalysisUpdateRef.current({
              fen: message.fen,
              depth: message.depth,
              score: message.score,
              bestMove: message.best_move,
              secondBestMove: message.second_best_move,
              pv: message.pv,
              pv2: message.pv2 || [],
              nps: message.nps,
              nodes: message.nodes,
              genId: message.gen_id,
              evalCanonical: message.eval_canonical,
            });
          }
        } else if (message.type === 'error') {
          if (onConnectionErrorRef.current) {
            onConnectionErrorRef.current(message.message || 'An error occurred during analysis.');
          }
        }
      } catch (err) {
        console.error('Error parsing WebSocket message', err);
      }
    };

    ws.onclose = () => {
      console.log('[FRONTEND] WebSocket disconnected (state: CLOSED).');
      setIsConnected(false);
      if (onConnectionChangeRef.current) onConnectionChangeRef.current(false);
      
      // Attempt reconnection up to 5 times with exponential backoff
      if (reconnectCountRef.current < 5) {
        reconnectCountRef.current++;
        const delay = Math.min(10000, Math.pow(2, reconnectCountRef.current) * 1000);
        console.warn(`[FRONTEND] Reconnect attempt ${reconnectCountRef.current}/5 in ${delay}ms...`);
        
        if (reconnectTimeoutRef.current) window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = window.setTimeout(() => {
          connect();
        }, delay);
      } else {
        console.error('[FRONTEND] WebSocket reconnection failed after 5 attempts.');
        if (onConnectionErrorRef.current) {
          onConnectionErrorRef.current("Unable to establish connection to the backend server. Please verify the server is running and reload the page.");
        }
      }
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  const analyzePosition = useCallback((fen: string, targetDepth: number = 18, uciMoves?: string[], isFenLoad?: boolean, genId?: number, moveNumber?: number, source?: string, multipv?: number) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log('[FRONTEND] Analysis request sent for FEN:', fen);
      wsRef.current.send(JSON.stringify({ 
        fen, 
        depth: targetDepth,
        uci_moves: uciMoves,
        is_fen_load: isFenLoad,
        gen_id: genId,
        move_number: moveNumber,
        source: source,
        multipv: multipv !== undefined ? multipv : 2
      }));
    } else {
      console.warn('[FRONTEND] WebSocket not connected, cannot request analysis.');
    }
  }, []);

  return {
    isConnected,
    analyzePosition,
  };
}
