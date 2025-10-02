import React, { createContext, useContext, useMemo, useState, useEffect } from "react";

import { FALLBACK_LOCALE, Locale, messages } from "./messages";

type TranslateParams = Record<string, string | number | undefined>;

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: TranslateParams) => string;
};

const STORAGE_KEY = "ui_locale";
const SUPPORTED_LOCALES: Locale[] = ["ru", "en"];

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

function detectBrowserLocale(): Locale {
  if (typeof window === "undefined") {
    return FALLBACK_LOCALE;
  }
  try {
    const persisted = window.localStorage.getItem(STORAGE_KEY);
    if (persisted === "ru" || persisted === "en") {
      return persisted;
    }
  } catch {
    // ignore storage issues
  }
  const navigatorLang = typeof navigator !== "undefined"
    ? (navigator.languages && navigator.languages.length ? navigator.languages[0] : navigator.language)
    : undefined;
  if (navigatorLang && navigatorLang.toLowerCase().startsWith("ru")) {
    return "ru";
  }
  return FALLBACK_LOCALE;
}

function replaceParams(template: string, params: TranslateParams | undefined): string {
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = params[key];
    if (value === undefined || value === null) {
      return match;
    }
    return String(value);
  });
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => detectBrowserLocale());

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // ignore write errors
    }
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => {
    const translate = (key: string, params?: TranslateParams) => {
      const bundle = messages[locale] || messages[FALLBACK_LOCALE];
      const fallbackBundle = messages[FALLBACK_LOCALE];
      const raw = bundle[key] ?? fallbackBundle[key] ?? key;
      return replaceParams(raw, params);
    };
    const setLocale = (next: Locale) => {
      if (next !== locale) {
        setLocaleState(next);
      }
    };
    return {
      locale,
      setLocale,
      t: translate,
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
}

export { SUPPORTED_LOCALES };

