/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Legacy tokens (kept for backward compat) ──────────────────────
        darkBg: '#0A0A0C',
        darkPanel: '#151517',
        darkHover: '#222226',
        chessGreen: '#7A8471',       // reassigned to muted sage
        chessGreenDark: '#5E6856',   // darker sage
        chessWhite: '#ECECD7',
        chessBlack: '#739552',

        // ── Antique Instrument palette ────────────────────────────────────
        antiqueBg:    '#0A0A0C',   // base background — warm near-black
        antiquePanel: '#151517',   // elevated panel surface
        antiqueRim:   '#1C1C1F',   // slightly lighter rim/border tone
        brassPrimary: '#C9A356',   // antique brass/gold — primary accent
        brassDark:    '#A07E3A',   // darker brass for pressed/hover states
        brassLight:   '#D9B870',   // lighter brass for highlights
        sageGreen:    '#7A8471',   // muted sage — success/good moves
        sageDark:     '#5E6856',   // darker sage
        brickRed:     '#8B3A3A',   // muted brick — danger/blunder
        brickDark:    '#6E2E2E',   // darker brick
        warmWhite:    '#EDEAE3',   // primary text — warm off-white
        warmWhiteDim: '#C8C4BC',   // secondary warm text
        mutedText:    '#8A8A85',   // muted/secondary text
        dimText:      '#5A5A57',   // very dim captions/timestamps
      },
      fontFamily: {
        sans:      ['Inter', 'Outfit', 'system-ui', 'sans-serif'],
        serif:     ['"Fraunces"', 'Georgia', 'serif'],
        fraunces:  ['"Fraunces"', 'Georgia', 'serif'],
        mono:      ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        jetbrains: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        outfit:    ['Outfit', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'panel':      '0 2px 12px rgba(0,0,0,0.55), 0 1px 3px rgba(0,0,0,0.4)',
        'panel-lg':   '0 8px 32px rgba(0,0,0,0.65), 0 2px 8px rgba(0,0,0,0.4)',
        'brass-glow': '0 0 20px rgba(201,163,86,0.12)',
        'brass-ring': 'inset 0 0 0 1px rgba(201,163,86,0.25)',
      },
    },
  },
  plugins: [],
}
