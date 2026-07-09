import type { Config } from 'tailwindcss'

// Colours resolve to CSS variables (defined in styles.css), so light/dark and
// alternate accent palettes switch by flipping [data-theme] — no Tailwind rebuild.
const v = (name: string) => `var(--${name})`

export default {
  content: ['./src/renderer/index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        panel: v('bg-2'),
        raised: v('bg-3'),
        inset: v('bg-inset'),
        hover: v('bg-hover'),
        border: v('border'),
        'border-2': v('border-2'),
        text: v('text'),
        'text-2': v('text-2'),
        'text-3': v('text-3'),
        accent: v('accent'),
        'accent-2': v('accent-2'),
        'accent-fg': v('accent-fg'),
        claude: v('claude'),
        star: v('star'),
        success: v('green'),
        danger: v('red')
      },
      fontFamily: {
        sans: ["'Hanken Grotesk'", 'system-ui', 'sans-serif'],
        mono: ["'JetBrains Mono'", 'ui-monospace', 'monospace']
      },
      borderRadius: {
        sm: '6px',
        md: '9px',
        lg: '12px',
        pill: '20px'
      },
      boxShadow: {
        raised: 'var(--shadow)'
      }
    }
  },
  plugins: []
} satisfies Config
