/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#101318',
        canvas: '#F1F3EE',
        panel: '#FBFCF9',
        line: '#D9DED6',
        muted: '#687078',
        cyan: '#08AAC4',
        lime: '#C4F35A',
        danger: '#D94F4F',
        warning: '#D99A2B',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Manrope', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 0 rgba(16, 19, 24, 0.03), 0 14px 36px rgba(16, 19, 24, 0.055)',
        float: '0 24px 70px rgba(16, 19, 24, 0.16)',
      },
    },
  },
  plugins: [],
};
