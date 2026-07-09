import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Theme } from '@shared/types'

interface ThemeCtx {
  theme: Theme
  toggle: () => void
}

const Ctx = createContext<ThemeCtx | null>(null)

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
}

export function ThemeProvider({ children }: { children: ReactNode }): JSX.Element {
  // Start on the light default; hydrate from persisted settings on mount.
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    window.deskmail.getSettings().then((s) => {
      setTheme(s.theme)
      applyTheme(s.theme)
    })
  }, [])

  const toggle = (): void => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    applyTheme(next)
    window.deskmail.setTheme(next)
  }

  return <Ctx.Provider value={{ theme, toggle }}>{children}</Ctx.Provider>
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
