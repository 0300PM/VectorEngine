import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { applyValidationLocale } from './app/services/validationLocale'
import { createAppI18n, detectLocale } from './i18n'
import './styles/main.css'

const locale = detectLocale(globalThis.localStorage, navigator.language)
applyValidationLocale(locale)
document.documentElement.lang = locale

createApp(App).use(createPinia()).use(createAppI18n(locale)).mount('#app')
