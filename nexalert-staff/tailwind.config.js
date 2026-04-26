export default {
  content: ["./index.html","./src/**/*.{js,jsx}"],
  theme: { extend: {
    fontFamily: { sans: ["'DM Sans'","system-ui","sans-serif"], mono: ["'JetBrains Mono'","monospace"] },
    colors: {
      void: { 950:'#020408', 900:'#050a10', 800:'#080f1a', 700:'#0d1829', 600:'#132035' },
    }
  }},
  plugins: [],
}
