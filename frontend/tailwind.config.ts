import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['Space Mono', 'monospace'],
        sans: ['DM Sans', 'sans-serif'],
      },
      colors: {
        brand: {
          red: '#ff3b4e',
          amber: '#ffb020',
          green: '#00e87a',
          blue: '#3d8bff',
          violet: '#9b6eff',
          cyan: '#00d4e8',
        },
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease forwards',
        'slide-up': 'slide-in-up 0.3s ease forwards',
        'spin-slow': 'spin 2s linear infinite',
      },
    },
  },
  plugins: [],
}

export default config
