import { ref } from 'vue'
import { useDark, useToggle } from '@vueuse/core'

const isDark = useDark({
  storageKey: 'theme',
  valueDark: 'dark',
  valueLight: 'light',
})
const toggleDark = useToggle(isDark)

const themeMode = ref(localStorage.getItem('theme-mode') || 'auto')

// Listen for system theme changes when in auto mode
const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
mediaQuery.addEventListener('change', (e) => {
  if (themeMode.value === 'auto') {
    if (e.matches !== isDark.value) {
      toggleDark()
    }
  }
})

export function useTheme() {
  function setTheme(mode: string) {
    themeMode.value = mode
    localStorage.setItem('theme-mode', mode)
    if (mode === 'dark') {
      if (!isDark.value) toggleDark()
    } else if (mode === 'light') {
      if (isDark.value) toggleDark()
    } else {
      // auto: follow system
      const systemDark = mediaQuery.matches
      if (systemDark !== isDark.value) toggleDark()
    }
  }

  return {
    isDark,
    themeMode,
    setTheme,
    toggleDark,
  }
}
