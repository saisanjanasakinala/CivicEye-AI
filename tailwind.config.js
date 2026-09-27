/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        civic: {
          bg: '#F5F7F8',
          primary: '#183D3D',
          accent: '#328477',
          card: '#DCE6E3',
          border: '#C2D1CD',
          muted: '#4A6666',
        },
        navy: {
          900: '#183D3D',
          800: '#224F4F',
          700: '#328477',
          600: '#4A6666',
        },
        teal: {
          600: '#183D3D',
          500: '#328477',
          400: '#328477',
          300: '#246359',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}
