/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    fontFamily: {
      sans: ['Exo 2', 'sans-serif'],
      display: ['Orbitron', 'sans-serif'],
      body: ['Exo 2', 'sans-serif'],
    },
    extend: {
      colors: {
        primary: 'var(--bg-primary)',
        secondary: 'var(--bg-secondary)',
        tertiary: 'var(--bg-tertiary)',
        elevated: 'var(--bg-elevated)',
        panel: 'var(--panel-solid)',
        accent: { 
          DEFAULT: 'var(--accent)', 
          light: 'var(--accent-light)',
          hover: 'var(--accent-hover)'
        },
        success: { DEFAULT: 'var(--success)', light: 'var(--success-light)' },
        warning: { DEFAULT: 'var(--warning)', light: 'var(--warning-light)' },
        danger: { DEFAULT: 'var(--danger)', light: 'var(--danger-light)' },
      },
      textColor: {
        primary: 'var(--text-primary)',
        secondary: 'var(--text-secondary)',
        tertiary: 'var(--text-tertiary)',
      },
      borderColor: {
        DEFAULT: 'var(--border)',
        strong: 'var(--border-strong)',
        glass: 'var(--glass-stroke)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow)',
        glass: 'var(--shadow-glass)',
        premium: 'var(--shadow-premium)',
      },
      ringColor: {
        DEFAULT: 'var(--ring)',
      },
      backgroundColor: {
        glass: 'var(--glass-card-medium)',
        panel: 'var(--panel-solid)',
      },
      borderRadius: {
        glass: 'var(--card-radius-md)',
        shell: 'var(--card-radius-lg)',
      },
    },
  },
  plugins: [],
}
