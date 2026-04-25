/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Space Grotesk', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        night: {
          950: '#04080f',
          900: '#080d1a',
          800: '#0c1325',
          700: '#111b35',
          600: '#1a2847',
        },
        crimson: {
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          400: '#f87171',
          300: '#fca5a5',
        },
        amber: {
          500: '#f59e0b',
          400: '#fbbf24',
        },
        electric: {
          500: '#6366f1',
          400: '#818cf8',
          300: '#a5b4fc',
          600: '#4f46e5',
        },
        emerald: {
          500: '#22c55e',
          400: '#4ade80',
        }
      },
      backgroundImage: {
        'grid-pattern': "linear-gradient(rgba(99,102,241,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.03) 1px, transparent 1px)",
      },
      backgroundSize: {
        'grid': '48px 48px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'ping-slow': 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
        'slide-in': 'slideIn 0.3s ease-out',
        'fade-in': 'fadeIn 0.4s ease-out',
      },
      keyframes: {
        slideIn: {
          '0%': { transform: 'translateX(-100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        }
      }
    },
  },
  plugins: [],
}
