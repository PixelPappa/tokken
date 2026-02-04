import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import './custom.css'
import SetupPage from './SetupPage.vue'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('SetupPage', SetupPage)

    // Vue mounted successfully — cancel the <head> recovery script
    // so it doesn't show the overlay or navigate away.
    if (typeof window !== 'undefined') {
      if ((window as any).__tokkenReloadTimer) {
        clearTimeout((window as any).__tokkenReloadTimer)
        ;(window as any).__tokkenReloadTimer = null
      }
      sessionStorage.removeItem('tokken-reloading')
    }
  }
} satisfies Theme
