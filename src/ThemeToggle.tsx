import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

type Theme = 'dark' | 'light'

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return localStorage.getItem('dtm-theme') === 'light'
        ? 'light' : 'dark'
    } catch {
      return 'dark'
    }
  })

  useEffect(() => {
    document.documentElement.classList.toggle(
      'dtm-light', theme === 'light'
    )
    try {
      localStorage.setItem('dtm-theme', theme)
    } catch {
      // Theme still works if storage is unavailable.
    }
  }, [theme])

  return (
    <button
      type="button"
      className="pl-theme-toggle"
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      onClick={() => setTheme(
        current => current === 'dark' ? 'light' : 'dark'
      )}
    >
      {theme === 'dark' ? <Sun size={17}/> : <Moon size={17}/>}
      <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
    </button>
  )
}
