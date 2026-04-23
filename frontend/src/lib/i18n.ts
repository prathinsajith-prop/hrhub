import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import en from '../locales/en.json'

// Lazily load the Arabic locale only when the user actually switches to it,
// so English-only sessions never download the unused bundle.
let arLoaded = false
async function ensureArabicLoaded() {
    if (arLoaded) return
    const mod = await import('../locales/ar.json')
    i18n.addResourceBundle('ar', 'translation', mod.default, true, true)
    arLoaded = true
}

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            en: { translation: en },
        },
        fallbackLng: 'en',
        supportedLngs: ['en', 'ar'],
        interpolation: {
            escapeValue: false,
        },
        detection: {
            order: ['localStorage', 'navigator'],
            caches: ['localStorage'],
            lookupLocalStorage: 'hrhub-lang',
        },
    })

/** Toggle direction and font on the document root */
export function applyLanguageDirection(lang: string) {
    const dir = lang === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.setAttribute('dir', dir)
    document.documentElement.setAttribute('lang', lang)
    document.documentElement.classList.toggle('rtl', lang === 'ar')
}

// Apply on initial load
applyLanguageDirection(i18n.language || 'en')
// If the detector picked Arabic at boot, fetch the bundle now.
if ((i18n.language || '').startsWith('ar')) {
    ensureArabicLoaded()
}

i18n.on('languageChanged', (lng) => {
    applyLanguageDirection(lng)
    if (lng.startsWith('ar')) ensureArabicLoaded()
})

export default i18n
