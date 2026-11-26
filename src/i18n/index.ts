/**
 * UI strings for the popup, the search sidebar and the cards and badges on pages.
 *
 * The catalogs in `locales/` use Chrome's `messages.json` format and are copied to
 * `_locales/<lang>/messages.json` at build time, which is where the manifest takes the
 * extension's name and description from. The UI reads them through `t()` rather than
 * `chrome.i18n.getMessage()`, because `chrome.i18n` always follows the browser's language
 * and the popup lets the user pick another one.
 */
import en from './locales/en.json';
import ru from './locales/ru.json';

export type Language = 'en' | 'ru';
/** What the user picked in the popup; `auto` follows the browser's UI language. */
export type LanguageSetting = 'auto' | Language;
export type MessageKey = keyof typeof en;

interface CatalogEntry {
  readonly message: string;
  readonly placeholders?: Readonly<Record<string, { readonly content: string }>>;
}

const CATALOGS: Readonly<Record<Language, Readonly<Record<string, CatalogEntry>>>> = { en, ru };

export const LANGUAGES: readonly Language[] = ['en', 'ru'];

/**
 * The browser's UI language, when it is one we have; English otherwise, and also where
 * `chrome.i18n` is missing (unit tests, the sandbox page), so tests don't depend on the
 * language of the machine running them.
 */
export const detectBrowserLanguage = (): Language => {
  const ui = typeof chrome !== 'undefined' ? chrome.i18n?.getUILanguage?.() : undefined;
  return ui?.toLowerCase().startsWith('ru') ? 'ru' : 'en';
};

export const resolveLanguage = (setting?: LanguageSetting): Language =>
  setting && setting !== 'auto' && LANGUAGES.includes(setting) ? setting : detectBrowserLanguage();

let current: Language = detectBrowserLanguage();

/** Apply the user's setting (or follow the browser). */
export const setLanguage = (setting?: LanguageSetting): Language => {
  current = resolveLanguage(setting);
  return current;
};

export const getLanguage = (): Language => current;

/**
 * Fill `$NAME$` placeholders the way `chrome.i18n.getMessage()` does: each placeholder's
 * `content` names a positional substitution (`$1`, `$2`, …).
 */
const format = (entry: CatalogEntry, substitutions: readonly (string | number)[]): string =>
  entry.message.replace(/\$([A-Za-z0-9_]+)\$/g, (whole, name: string) => {
    const content = entry.placeholders?.[name.toLowerCase()]?.content;
    const index = content?.match(/^\$(\d)$/)?.[1];
    return index ? String(substitutions[Number(index) - 1] ?? '') : whole;
  });

/** The string for `key` in the current language, falling back to English. */
export const t = (key: MessageKey, ...substitutions: (string | number)[]): string => {
  const entry = CATALOGS[current][key] ?? CATALOGS.en[key];
  return entry ? format(entry, substitutions) : key;
};
