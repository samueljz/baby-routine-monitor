import { ref, computed, watch } from 'vue'
import { darkTheme } from 'naive-ui'
import type { GlobalThemeOverrides } from 'naive-ui'

/**
 * Manages dark/light mode state, persists the preference to localStorage,
 * and syncs the `dark` CSS class on <html>.
 */
export function useTheme() {
  const isDarkMode = ref(false)

  watch(
    isDarkMode,
    (val) => {
      if (val) document.documentElement.classList.add('dark')
      else document.documentElement.classList.remove('dark')
    },
    { immediate: true },
  )

  /** Call once on app mount to restore the persisted theme. */
  function initTheme() {
    if (localStorage.getItem('brm_theme') === 'dark') isDarkMode.value = true
  }

  function toggleTheme() {
    isDarkMode.value = !isDarkMode.value
    localStorage.setItem('brm_theme', isDarkMode.value ? 'dark' : 'light')
  }

  const naiveTheme = computed(() => (isDarkMode.value ? darkTheme : null))

  const themeOverrides = computed<GlobalThemeOverrides>(() => ({
    common: {
      primaryColor: '#d97706',
      primaryColorHover: '#f59e0b',
      primaryColorPressed: '#b45309',
      borderRadius: '14px',
      bodyColor: isDarkMode.value ? '#0c0a09' : '#fdfaf5',
      cardColor: isDarkMode.value ? '#1c1917' : '#ffffff',
      modalColor: isDarkMode.value ? '#1c1917' : '#fffdf9',
      popoverColor: isDarkMode.value ? '#292524' : '#fffdf9',
    },
    Card: {
      borderRadius: '24px',
      paddingMedium: '20px',
    },
    Tabs: {
      tabBorderRadius: '12px',
      colorSegment: isDarkMode.value ? '#1c1917' : '#f3ece1',
      tabColorSegment: isDarkMode.value ? '#292524' : '#fffdf9',
      tabTextColorActiveSegment: isDarkMode.value ? '#fbbf24' : '#9a3412',
      tabTextColorSegment: isDarkMode.value ? '#a8a29e' : '#78716c',
    },
    Button: { borderRadiusMedium: '12px' },
  }))

  return { isDarkMode, naiveTheme, themeOverrides, initTheme, toggleTheme }
}
