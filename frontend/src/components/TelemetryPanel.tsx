import React, { useState } from 'react';
import { Activity, ChevronDown, ChevronUp, Cpu, Network } from 'lucide-react';

interface TelemetryPanelProps {
  status: 'Idle' | 'Starting' | 'Searching' | 'Cancelling' | 'Completed' | 'Error';
  genId: number;
  moveNumber: number;
  fen: string;
  searchStart: string;
  searchEnd: string;
  depth: number;
  targetDepth: number;
  nps: number;
  engineLatency: number; // in ms
  wsRtt: number; // in ms
  enginesActive: number;
  enginesAvailable: number;
  activeTasks: number;
  cancelledTasks: number;
  completedTasks: number;
  queueWaitTime: number; // in seconds
  avgDepthPerSec: number;
  evalUpdatesCount: number;
  pvUpdatesCount: number;
  arrowUpdatesCount: number;
  openingUpdatesCount: number;
  graphUpdatesCount: number;
  renderCount: number;
  isSynced: boolean;
}

export const TelemetryPanel: React.FC<TelemetryPanelProps> = ({
  status,
  genId,
  moveNumber,
  fen,
  searchStart,
  searchEnd,
  depth,
  targetDepth,
  nps,
  engineLatency,
  wsRtt,
  enginesActive,
  enginesAvailable,
  activeTasks,
  cancelledTasks,
  completedTasks,
  queueWaitTime,
  avgDepthPerSec,
  evalUpdatesCount,
  pvUpdatesCount,
  arrowUpdatesCount,
  openingUpdatesCount,
  graphUpdatesCount,
  renderCount,
  isSynced
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const getStatusColor = () => {
    switch (status) {
      case 'Searching': return 'text-chessGreen bg-chessGreen/10 border-chessGreen/30';
      case 'Starting': return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30';
      case 'Cancelling': return 'text-orange-400 bg-orange-400/10 border-orange-400/30';
      case 'Completed': return 'text-blue-400 bg-blue-400/10 border-blue-400/30';
      case 'Error': return 'text-red-400 bg-red-400/10 border-red-400/30';
      default: return 'text-white/40 bg-white/5 border-white/10';
    }
  };

  return (
    <div className="w-full antique-panel rounded-xl overflow-hidden shrink-0">
      {/* Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-[#C9A356] hover:bg-white/[0.015] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#C9A356]" />
          <span>Telemetry &amp; Stats</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className={`px-2 py-0.5 rounded text-[9px] font-bold border uppercase tracking-tight ${getStatusColor()}`}>
            {status}
          </span>
          {isOpen ? <ChevronUp className="w-4 h-4 text-[#5A5A57]" /> : <ChevronDown className="w-4 h-4 text-[#5A5A57]" />}
        </div>
      </button>

      {/* Stats Body */}
      {isOpen && (
        <div className="px-4 pb-4 pt-1 border-t border-[#C9A356]/10 text-[10.5px] text-[#8A8A85] space-y-3.5 select-none">
          
          {/* FEN Display */}
          <div className="space-y-1">
            <span className="text-[9px] font-semibold uppercase tracking-wide text-[#5A5A57]">Current FEN</span>
            <div className="bg-[#0A0A0C] p-2 rounded-lg border border-[#C9A356]/08 text-[9.5px] break-all select-all leading-normal max-h-16 overflow-y-auto custom-scrollbar"
                 style={{ fontFamily: '"JetBrains Mono", monospace' }}>
              {fen}
            </div>
          </div>

          {/* Core Telemetry Grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 pt-1">
            <div className="flex justify-between border-b border-white/[0.03] pb-1.5">
              <span className="text-[#5A5A57]">Gen ID:</span>
              <span className="font-bold text-[#C9A356]" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{genId}</span>
            </div>
            <div className="flex justify-between border-b border-white/[0.03] pb-1.5">
              <span className="text-[#5A5A57]">Move Number:</span>
              <span className="font-bold text-[#EDEAE3]" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{moveNumber}</span>
            </div>
            <div className="flex justify-between border-b border-white/[0.03] pb-1.5">
              <span className="text-[#5A5A57]">WebSocket RTT:</span>
              <span className="font-bold text-[#EDEAE3]" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{wsRtt > 0 ? `${wsRtt.toFixed(0)}ms` : 'N/A'}</span>
            </div>
            <div className="flex justify-between border-b border-white/[0.03] pb-1.5">
              <span className="text-[#5A5A57]">Engine Latency:</span>
              <span className="font-bold text-[#EDEAE3]" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{engineLatency > 0 ? `${engineLatency.toFixed(0)}ms` : 'N/A'}</span>
            </div>
            <div className="flex justify-between border-b border-white/[0.03] pb-1.5">
              <span className="text-[#5A5A57]">NPS:</span>
              <span className="font-bold text-[#EDEAE3]" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{nps > 0 ? `${(nps / 1000).toFixed(1)} kN/s` : '0 kN/s'}</span>
            </div>
            <div className="flex justify-between border-b border-white/[0.03] pb-1.5">
              <span className="text-[#5A5A57]">Avg Depth/Sec:</span>
              <span className="font-bold text-[#EDEAE3]" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{avgDepthPerSec > 0 ? `${avgDepthPerSec.toFixed(1)}/s` : '0/s'}</span>
            </div>
            <div className="flex justify-between border-b border-white/[0.03] pb-1.5">
              <span className="text-[#5A5A57]">Current Depth:</span>
              <span className="font-bold text-[#EDEAE3]" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{depth} / {targetDepth}</span>
            </div>
            <div className="flex justify-between border-b border-white/[0.03] pb-1.5">
              <span className="text-[#5A5A57]">React Renders:</span>
              <span className="font-bold text-[#EDEAE3]" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{renderCount}</span>
            </div>
          </div>

          {/* Time logs */}
          <div className="space-y-1.5 bg-[#0A0A0C] p-2.5 rounded-lg border border-[#C9A356]/08 text-[9.5px]">
            <div className="flex justify-between">
              <span className="text-[#5A5A57]">Search Start:</span>
              <span className="text-[#8A8A85]" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{searchStart || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#5A5A57]">Search End:</span>
              <span className="text-[#8A8A85]" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{searchEnd || 'N/A'}</span>
            </div>
          </div>

          {/* Backend Engine Pool Telemetry */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wide text-[#5A5A57]">
              <Cpu className="w-3.5 h-3.5 text-[#C9A356]" />
              <span>Backend Engine Pool</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[9.5px] bg-[#0A0A0C] p-2.5 rounded-lg border border-[#C9A356]/08">
              <div className="flex justify-between">
                <span className="text-[#5A5A57]">Engines Active:</span>
                <span className="font-bold text-[#EDEAE3]" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{enginesActive}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5A5A57]">Engines Free:</span>
                <span className="font-bold text-[#EDEAE3]" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{enginesAvailable}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5A5A57]">Active Tasks:</span>
                <span className="font-bold text-[#EDEAE3]" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{activeTasks}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5A5A57]">Cancelled Tasks:</span>
                <span className="font-bold text-[#EDEAE3]" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{cancelledTasks}</span>
              </div>
              <div className="flex justify-between col-span-2 border-t border-white/[0.04] pt-1.5 mt-1">
                <span className="text-[#5A5A57]">Avg Queue Wait:</span>
                <span className="font-bold text-[#EDEAE3]" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{queueWaitTime.toFixed(3)}s</span>
              </div>
              <div className="flex justify-between col-span-2">
                <span className="text-[#5A5A57]">Completed Tasks:</span>
                <span className="font-bold text-[#EDEAE3]" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{completedTasks}</span>
              </div>
            </div>
          </div>

          {/* Message Sync telemetry */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wide text-[#5A5A57]">
              <Network className="w-3.5 h-3.5 text-[#C9A356]" />
              <span>WebSocket Message Logs</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[9.5px] bg-[#0A0A0C] p-2.5 rounded-lg border border-[#C9A356]/08">
              <div className="flex justify-between">
                <span className="text-[#5A5A57]">Eval Packets:</span>
                <span className="text-[#EDEAE3] font-bold" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{evalUpdatesCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5A5A57]">PV Packets:</span>
                <span className="text-[#EDEAE3] font-bold" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{pvUpdatesCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5A5A57]">Arrow updates:</span>
                <span className="text-[#EDEAE3] font-bold" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{arrowUpdatesCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5A5A57]">Opening updates:</span>
                <span className="text-[#EDEAE3] font-bold" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{openingUpdatesCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5A5A57]">Graph updates:</span>
                <span className="text-[#EDEAE3] font-bold" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{graphUpdatesCount}</span>
              </div>
              <div className="flex justify-between border-t border-white/[0.04] pt-1.5 mt-1 col-span-2">
                <span className="text-[#5A5A57]">WebSocket Sync:</span>
                <span className={`font-bold ${isSynced ? 'text-[#7A8471]' : 'text-[#8B3A3A]'}`}
                      style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                  {isSynced ? 'Synchronized' : 'Offline'}
                </span>
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
};

