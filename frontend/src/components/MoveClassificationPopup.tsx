import React from 'react';
import { motion } from 'framer-motion';
import { CLASSIFICATIONS } from '../constants/classifications';

interface MoveClassificationPopupProps {
  classification?: string;
  reasons?: string[];
  bestMoveSan?: string; // Optional coaching recommendation
  playedMoveSan?: string;
  suggestedLine?: string; // Optional coaching tip
}

export const MoveClassificationPopup: React.FC<MoveClassificationPopupProps> = ({
  classification,
  reasons,
  bestMoveSan,
  playedMoveSan,
  suggestedLine
}) => {
  if (!classification) return null;
  const config = CLASSIFICATIONS[classification.toLowerCase()] || CLASSIFICATIONS.best;

  const reasonText = reasons && reasons.length > 0 ? reasons.join('; ') : config.desc;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={`w-full max-w-[720px] p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg ${config.bgAlpha} ${config.borderColor} select-none font-sans mt-2.5`}
    >
      <div className="flex items-start gap-3.5">
        {/* Animated Badge Icon */}
        <span className="text-2xl mt-0.5 shrink-0 select-none">
          {config.icon}
        </span>
        <div className="flex-1">
          {/* Classification Title */}
          <h4 className={`text-xs font-black uppercase tracking-wider ${config.textColor} leading-none`}>
            {config.name}
          </h4>
          {/* Short Explanation */}
          <p className="text-white/80 text-[11px] font-bold mt-1.5 leading-normal">
            {reasonText}
          </p>

          {/* FUTURE-READY: coaching placeholders */}
          {(bestMoveSan || suggestedLine) && (
            <div className="mt-2.5 pt-2.5 border-t border-white/5 space-y-1 text-[10px] text-white/50 font-medium">
              {bestMoveSan && (
                <div>
                  <span className="text-chessGreen font-extrabold mr-1">Recommended:</span>
                  Stockfish preferred <span className="font-mono text-white bg-white/5 px-1 rounded">{bestMoveSan}</span> instead of <span className="font-mono text-white/60 bg-white/5 px-1 rounded">{playedMoveSan}</span>.
                </div>
              )}
              {suggestedLine && (
                <div>
                  <span className="text-[#c5a059] font-extrabold mr-1">Coaching Tip:</span>
                  {suggestedLine}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default MoveClassificationPopup;
