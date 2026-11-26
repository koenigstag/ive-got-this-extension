import { describe, it, expect, afterEach, vi } from 'vitest';
import en from './locales/en.json';
import ru from './locales/ru.json';
import { detectBrowserLanguage, getLanguage, resolveLanguage, setLanguage, t } from './index.js';

type Catalog = Record<
  string,
  { message: string; placeholders?: Record<string, { content: string }> }
>;

describe('locale catalogs', () => {
  const catalogs: Record<string, Catalog> = { en, ru };

  it('have the same keys in every language', () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort());
  });

  it('use the same placeholders in every language', () => {
    for (const [key, entry] of Object.entries(en as Catalog)) {
      const tokens = (message: string) =>
        [...message.matchAll(/\$([A-Za-z0-9_]+)\$/g)].map((m) => m[1].toLowerCase()).sort();
      expect(tokens((ru as Catalog)[key].message), key).toEqual(tokens(entry.message));
      expect((ru as Catalog)[key].placeholders, key).toEqual(entry.placeholders);
    }
  });

  it('are valid Chrome messages.json files', () => {
    for (const [lang, catalog] of Object.entries(catalogs)) {
      for (const [key, entry] of Object.entries(catalog)) {
        expect(key, `${lang}: key`).toMatch(/^[A-Za-z0-9_]+$/);
        expect(entry.message.length, `${lang}.${key}`).toBeGreaterThan(0);
        for (const placeholder of Object.values(entry.placeholders ?? {})) {
          expect(placeholder.content, `${lang}.${key}`).toMatch(/^\$[1-9]$/);
        }
      }
    }
  });
});

describe('t', () => {
  afterEach(() => {
    setLanguage('en');
  });

  it('fills placeholders in order', () => {
    setLanguage('en');
    expect(t('poweredBy', 'Jellyfin')).toBe('Powered by Jellyseerr · Jellyfin');
    expect(t('alertRequestFailed', 'Dune', 'timeout')).toBe('Failed to request "Dune": timeout');
  });

  it('speaks the language that was set', () => {
    setLanguage('ru');
    expect(t('request')).toBe('Запросить');
    expect(t('playOnServer', 'Jellyfin')).toBe('Смотреть в Jellyfin');
    expect(t('alertRequestFailed', 'Дюна', 'таймаут')).toBe('Не удалось запросить «Дюна»: таймаут');
  });
});

describe('language selection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setLanguage('en');
  });

  it('follows the browser UI language for "auto"', () => {
    vi.stubGlobal('chrome', { i18n: { getUILanguage: () => 'ru-RU' } });
    expect(setLanguage('auto')).toBe('ru');
    expect(getLanguage()).toBe('ru');
  });

  it('keeps an explicit choice whatever the browser says', () => {
    vi.stubGlobal('chrome', { i18n: { getUILanguage: () => 'ru' } });
    expect(resolveLanguage('en')).toBe('en');
  });

  it('falls back to English without chrome.i18n or for an unknown value', () => {
    vi.stubGlobal('chrome', undefined);
    expect(detectBrowserLanguage()).toBe('en');
    vi.stubGlobal('chrome', { i18n: { getUILanguage: () => 'de' } });
    expect(resolveLanguage('auto')).toBe('en');
    expect(resolveLanguage('fr' as never)).toBe('en');
  });
});
