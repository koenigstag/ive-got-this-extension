import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The e2e suite injects the content script into each fixture page itself, so
 * it passes even when manifest.json would never run the script on that site.
 * These tests check the manifest against the same page URLs.
 */

interface Manifest {
  host_permissions: string[];
  content_scripts: { matches: string[] }[];
}

const manifest = JSON.parse(
  readFileSync(resolve(process.cwd(), 'manifest.json'), 'utf-8'),
) as Manifest;

const escapeRegExp = (value: string): string => value.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

/** Chrome match pattern (`<scheme>://<host>/<path>`) against a page URL. */
const matchesPattern = (pattern: string, pageUrl: string): boolean => {
  const parsed = /^(\*|https?):\/\/([^/]+)(\/.*)$/.exec(pattern);
  if (!parsed) return false;
  const [, scheme, host, path] = parsed;
  const url = new URL(pageUrl);

  if (scheme === '*' ? !/^https?:$/.test(url.protocol) : url.protocol !== `${scheme}:`) {
    return false;
  }
  const hostOk = host.startsWith('*.')
    ? url.hostname === host.slice(2) || url.hostname.endsWith(host.slice(1))
    : url.hostname === host;
  if (!hostOk) return false;

  const pathRegExp = new RegExp(`^${path.split('*').map(escapeRegExp).join('.*')}$`);
  return pathRegExp.test(url.pathname + url.search);
};

// Pages from the e2e fixtures, one or more per supported site.
const PAGES = [
  'https://www.imdb.com/title/tt0133093/',
  'https://trakt.tv/movies/the-matrix-1999',
  'https://app.trakt.tv/shows/the-mentalist',
  'https://www.google.com/search?q=the+matrix+1999',
  'https://www.bing.com/search?q=the+matrix',
  'https://yandex.ru/search/?text=matrix+1999',
  // Yandex drops the slash when it adds the region: /search?text=...&lr=...
  'https://yandex.ru/search?text=matrix+1999&lr=213',
  'https://ya.ru/search/?text=breaking+bad',
  'https://yandex.com/search/?text=breaking+bad',
  'https://www.justwatch.com/us/movie/the-matrix',
  'https://www.justwatch.com/us/tv-show/breaking-bad',
  'https://www.justwatch.com/us/search?q=matrix',
  'https://www.netflix.com/title/80100173',
  'https://www.netflix.com/de-en/title/80057281',
  'https://www.netflix.com/de/title/81458416',
  'https://www.ivi.ru/watch/109140',
  'https://www.ivi.ru/watch/himera',
  'https://shikimori.io/animes/54492-kusuriya-no-hitorigoto',
  'https://shikimori.one/animes/z32182-mob-psycho-100',
  'https://www.themoviedb.org/tv/220542-kusuriya-no-hitorigoto',
  'https://www.themoviedb.org/movie/372058-kimi-no-na-wa?language=ru-RU',
  'https://www.thetvdb.com/series/kusuriya-no-hitorigoto',
  'https://www.thetvdb.com/movies/your-name',
  'https://www.ivi.tv/watch/himera',
  'https://www.kinopoisk.ru/film/301/',
  'https://www.kinopoisk.ru/series/404900/',
];

describe('manifest.json', () => {
  const contentScriptMatches = manifest.content_scripts.flatMap((script) => script.matches);

  it.each(PAGES)('runs the content script on %s', (page) => {
    expect(contentScriptMatches.some((pattern) => matchesPattern(pattern, page))).toBe(true);
  });

  it.each(PAGES)('has a host permission for %s', (page) => {
    expect(manifest.host_permissions.some((pattern) => matchesPattern(pattern, page))).toBe(true);
  });

  it('reads match patterns the way Chrome does', () => {
    expect(matchesPattern('https://*.trakt.tv/*', 'https://trakt.tv/shows/x')).toBe(true);
    expect(matchesPattern('https://www.google.com/search*', 'https://www.google.com/maps')).toBe(
      false,
    );
    expect(
      matchesPattern('https://www.netflix.com/title/*', 'https://www.netflix.com/de/title/1'),
    ).toBe(false);
    expect(
      matchesPattern('https://yandex.ru/search*', 'https://music.yandex.ru/search?text=x'),
    ).toBe(false);
  });
});
