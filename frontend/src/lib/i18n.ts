import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import en from '../locales/en.json'
import ar from '../locales/ar.json'

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            en: { translation: en },
            ar: { translation: ar },
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

i18n.on('languageChanged', applyLanguageDirection)

export default i18n
