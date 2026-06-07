/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Class-based dark mode: a useTheme hook toggles `.dark` on <html>.
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        display: ['Fraunces', 'Poppins', 'serif'],
      },
      colors: {
        beige: {
          50:  '#FDFBF5',
          100: '#FAF6EB',
          200: '#F5EDD6',
          300: '#EDE0BC',
          DEFAULT: '#F5EDD6',
        },
        olive: {
          50:  '#F2F5EC',
          100: '#DCE5C5',
          200: '#BACB8E',
          300: '#8FA857',
          400: '#6B8030',
          500: '#516024',
          600: '#3A451A',
          DEFAULT: '#6B8030',
        },
        khaki: {
          50:  '#FAF7F0',
          100: '#F0E8D4',
          200: '#DDD0AD',
          300: '#C9B587',
          400: '#B09A65',
          500: '#8C7A4D',
          DEFAULT: '#C9B587',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(58, 69, 26, 0.04), 0 1px 3px rgba(58, 69, 26, 0.06)',
        pop: '0 6px 24px -8px rgba(58, 69, 26, 0.18), 0 2px 6px rgba(58, 69, 26, 0.08)',
        'inset-tl': 'inset 1px 1px 0 rgba(255,255,255,0.5)',
      },
    },
  },
  plugins: [],
};
