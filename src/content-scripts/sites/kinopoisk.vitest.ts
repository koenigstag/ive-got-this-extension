import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../common-ui.js', async () => {
  const actual = await vi.importActual('../common-ui.js');
  return { ...actual, sendMessage: vi.fn(), injectSkeletonKeyframes: vi.fn() };
});

import { sendMessage } from '../common-ui.js';
import { initKinopoisk, KINOPOISK_CARD_ID, KINOPOISK_SKELETON_ID } from './kinopoisk.js';
import type { SearchJellyseerrResponse } from '../../types/messages.js';

const mockedSend = vi.mocked(sendMessage);

const setUrl = (url: string): void => {
  Object.defineProperty(window, 'location', {
    value: new URL(url),
    writable: true,
    configurable: true,
  });
};

const TITLES = {
  '301': { type: 'Movie', name: 'Матрица', alt: 'The Matrix', year: '1999', h1: 'Матрица (1999)' },
  '41519': { type: 'Movie', name: 'Брат', alt: undefined, year: '1997', h1: 'Брат (1997)' },
};

/** A Kinopoisk title page as the app renders it: JSON-LD in <head>, the title block in <main>. */
const renderTitle = (id: keyof typeof TITLES): void => {
  const t = TITLES[id];
  setUrl(`https://www.kinopoisk.ru/film/${id}/`);
  document.head.innerHTML = `<script type="application/ld+json">${JSON.stringify({
    '@type': t.type,
    name: t.name,
    alternateName: t.alt,
    datePublished: t.year,
    url: `https://www.kinopoisk.ru/film/${id}/`,
  })}</script>`;
  document.body.innerHTML = `
    <main>
      <div class="styles_topLine"><div class="styles_column">
        <div class="styles_header">
          <div class="styles_title"><h1>${t.h1}</h1><div class="styles_subtitle">${t.alt ?? ''}</div></div>
          <div class="styles_topText">Описание.</div>
          <div class="styles_buttons"><button>Буду смотреть</button></div>
        </div>
      </div></div>
      <div class="styles_topLine"><h3>О фильме</h3></div>
    </main>`;
};

const result = (title: string) => ({
  id: 603,
  title,
  year: 1999,
  mediaType: 'movie' as const,
  overview: 'Overview',
  status: 'not_requested' as const,
});

const searchResponse = (results: ReturnType<typeof result>[]): SearchJellyseerrResponse => ({
  type: 'SEARCH_JELLYSEERR_RESPONSE',
  payload: { results, jellyseerrEnabled: true, serverType: 'jellyfin' },
});

/** Jellyseerr finds the given titles, nothing else. */
const jellyseerrFinds = (found: Record<string, string>) =>
  mockedSend.mockImplementation(async (message: { type: string; payload?: { query?: string } }) => {
    if (message.type === 'GET_CONFIG') {
      return { type: 'GET_CONFIG_RESPONSE', payload: { serverType: 'jellyfin' } };
    }
    const hit = found[message.payload?.query ?? ''];
    return searchResponse(hit ? [result(hit)] : []);
  });

const sentSearches = () =>
  mockedSend.mock.calls
    .map(([message]) => message as { type: string; payload?: unknown })
    .filter((message) => message.type === 'SEARCH_JELLYSEERR')
    .map((message) => message.payload);

describe('Kinopoisk card', () => {
  let stop: (() => void) | undefined;

  beforeEach(() => {
    mockedSend.mockReset();
  });

  afterEach(() => {
    stop?.();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('searches the original title and puts the card at the end of the title block', async () => {
    renderTitle('301');
    jellyseerrFinds({ 'The Matrix': 'The Matrix' });

    stop = initKinopoisk();
    await vi.waitFor(() => expect(document.getElementById(KINOPOISK_CARD_ID)).not.toBeNull());

    expect(sentSearches()).toEqual([{ query: 'The Matrix', mediaType: 'movie', year: 1999 }]);
    const header = document.querySelector('.styles_header')!;
    expect(header.lastElementChild?.id).toBe(KINOPOISK_CARD_ID);
    expect(header.lastElementChild?.textContent).toContain('The Matrix');
    expect(document.getElementById(KINOPOISK_SKELETON_ID)).toBeNull();
  });

  it('falls back to the Russian title', async () => {
    renderTitle('301');
    jellyseerrFinds({ Матрица: 'The Matrix' });

    stop = initKinopoisk();
    await vi.waitFor(() => expect(document.getElementById(KINOPOISK_CARD_ID)).not.toBeNull());

    expect(sentSearches()).toEqual([
      { query: 'The Matrix', mediaType: 'movie', year: 1999 },
      { query: 'Матрица', mediaType: 'movie', year: 1999 },
    ]);
  });

  it('follows in-app navigation and puts a removed card back without a new search', async () => {
    renderTitle('301');
    jellyseerrFinds({ 'The Matrix': 'The Matrix', Брат: 'Brother' });
    stop = initKinopoisk();
    await vi.waitFor(() => expect(document.getElementById(KINOPOISK_CARD_ID)).not.toBeNull());

    // The app re-renders the header: the card is gone, it comes back from memory.
    document.getElementById(KINOPOISK_CARD_ID)!.remove();
    await vi.waitFor(() => expect(document.getElementById(KINOPOISK_CARD_ID)).not.toBeNull());
    expect(sentSearches()).toHaveLength(1);

    // Another title, without a page load.
    renderTitle('41519');
    await vi.waitFor(() =>
      expect(document.getElementById(KINOPOISK_CARD_ID)?.textContent).toContain('Brother'),
    );
    expect(sentSearches()).toEqual([
      { query: 'The Matrix', mediaType: 'movie', year: 1999 },
      { query: 'Брат', mediaType: 'movie', year: 1997 },
    ]);
    expect(document.querySelectorAll(`#${KINOPOISK_CARD_ID}`)).toHaveLength(1);
  });

  it('does nothing off title pages', async () => {
    setUrl('https://www.kinopoisk.ru/lists/movies/top250/');
    document.body.innerHTML = '<main><h1>250 лучших фильмов</h1></main>';
    jellyseerrFinds({});

    stop = initKinopoisk();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockedSend).not.toHaveBeenCalled();
  });
});
