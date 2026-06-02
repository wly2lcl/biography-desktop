import zhCN from './locales/zh-CN.json';

type LocaleMessages = typeof zhCN;
type TranslationKey = keyof LocaleMessages;

const locales: Record<string, LocaleMessages> = {
  'zh-CN': zhCN,
};

let currentLocale = 'zh-CN';

export function setLocale(locale: string): void {
  if (locales[locale]) {
    currentLocale = locale;
  }
}

export function getLocale(): string {
  return currentLocale;
}

export function getAvailableLocales(): string[] {
  return Object.keys(locales);
}

export function t(key: TranslationKey, params?: Record<string, string>): string {
  const messages = locales[currentLocale] || locales['zh-CN'];
  let text = messages[key] || key;

  if (params) {
    for (const [paramKey, value] of Object.entries(params)) {
      text = text.replace(`{${paramKey}}`, value);
    }
  }

  return text;
}

// Convenience: React hook for translations
// (not using React here since this is a plain TS module,
// but provides a helper for components to use)
export function createTranslator() {
  return { t, setLocale, getLocale, getAvailableLocales };
}
