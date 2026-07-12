export interface ClassificationStyle {
  name: string;
  icon: string;
  badgeText: string;
  color: string;
  textColor: string;
  bgColor: string;
  bgAlpha: string;
  borderColor: string;
  glowColor: string;
  desc: string;
}

export const CLASSIFICATIONS: Record<string, ClassificationStyle> = {
  brilliant: {
    name: 'Brilliant Move',
    icon: '⭐',
    badgeText: '!!',
    color: '#00bcd4', // teal/cyan
    textColor: 'text-[#00bcd4]',
    bgColor: 'bg-[#00bcd4]',
    bgAlpha: 'bg-[#00bcd4]/10 backdrop-blur-md',
    borderColor: 'border-[#00bcd4]/30',
    glowColor: 'shadow-[0_0_12px_rgba(0,188,212,0.25)]',
    desc: 'A spectacular sacrifice that preserves the winning advantage.'
  },
  great: {
    name: 'Great Move',
    icon: '👍',
    badgeText: '!',
    color: '#3b82f6', // blue
    textColor: 'text-[#3b82f6]',
    bgColor: 'bg-[#3b82f6]',
    bgAlpha: 'bg-[#3b82f6]/10 backdrop-blur-md',
    borderColor: 'border-[#3b82f6]/20',
    glowColor: 'shadow-[0_0_10px_rgba(59,130,246,0.15)]',
    desc: 'An excellent, high-impact move that is difficult for humans to find.'
  },
  best: {
    name: 'Best Move',
    icon: '✅',
    badgeText: '★',
    color: '#81b64c', // green
    textColor: 'text-[#81b64c]',
    bgColor: 'bg-[#81b64c]',
    bgAlpha: 'bg-[#81b64c]/10 backdrop-blur-md',
    borderColor: 'border-[#81b64c]/30',
    glowColor: 'shadow-[0_0_12px_rgba(129,182,76,0.2)]',
    desc: 'The best move in the position.'
  },
  excellent: {
    name: 'Excellent Move',
    icon: '🟢',
    badgeText: '★',
    color: '#a3e635', // light green
    textColor: 'text-[#a3e635]',
    bgColor: 'bg-[#a3e635]',
    bgAlpha: 'bg-[#a3e635]/10 backdrop-blur-md',
    borderColor: 'border-[#a3e635]/20',
    glowColor: 'shadow-[0_0_8px_rgba(163,230,53,0.15)]',
    desc: 'An equally strong alternative to the engine\'s preferred line.'
  },
  good: {
    name: 'Good Move',
    icon: '✔',
    badgeText: '✓',
    color: '#3b82f6', // blue (matching Good=blue from prompt)
    textColor: 'text-[#3b82f6]',
    bgColor: 'bg-[#3b82f6]',
    bgAlpha: 'bg-[#3b82f6]/10 backdrop-blur-md',
    borderColor: 'border-[#3b82f6]/20',
    glowColor: 'shadow-[0_0_8px_rgba(59,130,246,0.1)]',
    desc: 'A solid move, though other stronger alternatives existed.'
  },
  book: {
    name: 'Book Move',
    icon: '📖',
    badgeText: '📖',
    color: '#9ca3af', // gray
    textColor: 'text-[#9ca3af]',
    bgColor: 'bg-[#9ca3af]',
    bgAlpha: 'bg-[#9ca3af]/10 backdrop-blur-md',
    borderColor: 'border-[#9ca3af]/30',
    glowColor: 'shadow-[0_0_12px_rgba(156,163,175,0.15)]',
    desc: 'A standard opening theory move.'
  },
  inaccuracy: {
    name: 'Inaccuracy',
    icon: '⚠',
    badgeText: '?!',
    color: '#f97316', // orange
    textColor: 'text-[#f97316]',
    bgColor: 'bg-[#f97316]',
    bgAlpha: 'bg-[#f97316]/10 backdrop-blur-md',
    borderColor: 'border-[#f97316]/30',
    glowColor: 'shadow-[0_0_12px_rgba(249,115,22,0.15)]',
    desc: 'A slight mistake that gives the opponent minor counterplay.'
  },
  mistake: {
    name: 'Mistake',
    icon: '❓',
    badgeText: '?',
    color: '#ea580c', // red-orange
    textColor: 'text-[#ea580c]',
    bgColor: 'bg-[#ea580c]',
    bgAlpha: 'bg-[#ea580c]/10 backdrop-blur-md',
    borderColor: 'border-[#ea580c]/30',
    glowColor: 'shadow-[0_0_12px_rgba(234,88,12,0.2)]',
    desc: 'A bad move that compromises your position.'
  },
  blunder: {
    name: 'Blunder',
    icon: '❌',
    badgeText: '??',
    color: '#ef4444', // red
    textColor: 'text-[#ef4444]',
    bgColor: 'bg-[#ef4444]',
    bgAlpha: 'bg-[#ef4444]/10 backdrop-blur-md',
    borderColor: 'border-[#ef4444]/35',
    glowColor: 'shadow-[0_0_15px_rgba(239,68,68,0.25)]',
    desc: 'A critical blunder that throws away the game.'
  },
  miss: {
    name: 'Missed Win',
    icon: '🎯',
    badgeText: '×',
    color: '#ef4444', // red (miss matching blunder/red)
    textColor: 'text-[#ef4444]',
    bgColor: 'bg-[#ef4444]',
    bgAlpha: 'bg-[#ef4444]/10 backdrop-blur-md',
    borderColor: 'border-[#ef4444]/30',
    glowColor: 'shadow-[0_0_12px_rgba(239,68,68,0.2)]',
    desc: 'An overlooked chance to capture material or checkmate.'
  }
};
