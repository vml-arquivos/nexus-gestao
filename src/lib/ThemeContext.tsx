import React, { createContext, useContext, useEffect, useState } from 'react'

/**
 * ThemeContext provê o tema atual (light ou dark) e uma função para alternar.
 * A preferência é persistida em localStorage e o atributo data-theme é
 * aplicado no document.documentElement para permitir seleção de temas via CSS.
 */
type Theme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light')

  // Carrega tema do localStorage ou usa preferência do sistema
  useEffect(() => {
    const stored = localStorage.getItem('nexus-theme') as Theme | null
    if (stored === 'dark' || stored === 'light') {
      setTheme(stored)
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      setTheme(prefersDark ? 'dark' : 'light')
    }
  }, [])

  // Aplica atributo data-theme e persiste em localStorage
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('nexus-theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return ctx
}