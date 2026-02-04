import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import './custom.css'
import SetupPage from './SetupPage.vue'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('SetupPage', SetupPage)
  }
} satisfies Theme
