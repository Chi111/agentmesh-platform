/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0D1117',
        canvas: '#F4F6F1',
        panel: '#FFFFFF',
        line: '#DCE3DF',
        muted: '#667078',
        cyan: '#00B8D9',
        lime: '#B7F34A',
        danger: '#D94F4F',
        warning: '#D99A2B',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        card: '0 12px 30px rgba(13, 17, 23, 0.06)',
        float: '0 18px 50px rgba(13, 17, 23, 0.14)',
      },
    },
  },
  plugins: [],
};
