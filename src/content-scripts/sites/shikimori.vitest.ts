import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../common-ui.js', async () => {
  const actual = await vi.importActual('../common-ui.js');
  return { ...actual, sendMessage: vi.fn(), injectSkeletonKeyframes: vi.fn() };
});

import { sendMessage } from '../common-ui.js';
import { initShikimori, SHIKIMORI_CARD_ID, SHIKIMORI_SKELETON_ID } from './shikimori.js';
import type { SearchJellyseerrResponse } from '../../types/messages.js';

const mockedSend = vi.mocked(sendMessage);

const searchResponse = (
  results: SearchJellyseerrResponse['payload']['results'],
  overrides: Partial<SearchJellyseerrResponse['payload']> = {},
): SearchJellyseerrResponse => ({
  type: 'SEARCH_JELLYSEERR_RESPONSE',
  payload: {
    results,
    jellyseerrEnabled: true,
    serverType: 'jellyfin',
    jellyseerrUrl: 'http://localhost:5055',
    ...overrides,
  },
});

const result = (title: string, mediaType: 'movie' | 'tv' = 'tv') => ({
  id: 1,
  title,
  year: 2023,
  mediaType,
  overview: 'Overview',
  status: 'not_requested' as const,
});

const setUrl = (url: string): void => {
  Object.defineProperty(window, 'location', {
    value: new URL(url),
    writable: true,
    configurable: true,
  });
};

const ANIMES = {
  '54492-kusuriya-no-hitorigoto': {
    type: 'TVSeries',
    name: 'Kusuriya no Hitorigoto',
    alternateName: ['Монолог фармацевта', 'The Apothecary Diaries'],
    datePublished: '2023-10-22',
    russian: 'Монолог фармацевта',
    kind: 'TV Сериал',
  },
  '32281-kimi-no-na-wa': {
    type: 'Movie',
    name: 'Kimi no Na wa.',
    alternateName: ['Твоё имя', 'Your Name.'],
    datePublished: '2016-08-26',
    russian: 'Твоё имя',
    kind: 'Фильм',
  },
};

/** Render an anime page the way Turbolinks leaves it: the new body, the JSON-LD added to <head>. */
const visit = (slug: keyof typeof ANIMES): void => {
  const anime = ANIMES[slug];
  const url = `https://shikimori.io/animes/${slug}`;
  setUrl(url);
  const ld = document.createElement('script');
  ld.type = 'application/ld+json';
  ld.textContent = JSON.stringify({
    '@type': anime.type,
    url,
    name: anime.name,
    alternateName: anime.alternateName,
    datePublished: anime.datePublished,
  });
  document.head.appendChild(ld);
  document.body.innerHTML = `
    <h1>${anime.russian} <span class="b-separator inline">/</span> ${anime.name}</h1>
    <div class="b-db_entry">
      <div class="c-about"><div class="b-entry-info"><div class="line">
        <div class="key">Тип:</div><div class="value">${anime.kind}</div>
      </div></div></div>
      <div class="c-description"><div class="subheadline">Описание</div></div>
    </div>`;
};

const sentSearches = () =>
  mockedSend.mock.calls
    .map(([message]) => message as { type: string; payload?: unknown })
    .filter((message) => message.type === 'SEARCH_JELLYSEERR')
    .map((message) => message.payload);

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('Shikimori card', () => {
  let stop: (() => void) | undefined;
  const start = (): void => {
    stop = initShikimori();
  };

  afterEach(() => stop?.());

  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    mockedSend.mockReset();
  });

  /** Jellyseerr finds the given titles, nothing else. */
  const jellyseerrFinds = (found: Record<string, ReturnType<typeof result>[]>) =>
    mockedSend.mockImplementation(
      async (message: { type: string; payload?: { query?: string } }) => {
        if (message.type === 'GET_CONFIG') {
          return { type: 'GET_CONFIG_RESPONSE', payload: { serverType: 'jellyfin' } };
        }
        return searchResponse(found[message.payload?.query ?? ''] ?? []);
      },
    );

  it('tries the next title until one is found, and puts the card above the description', async () => {
    visit('54492-kusuriya-no-hitorigoto');
    jellyseerrFinds({ 'Kusuriya no Hitorigoto': [result('The Apothecary Diaries')] });

    start();
    await vi.waitFor(() => expect(document.getElementById(SHIKIMORI_CARD_ID)).not.toBeNull());

    expect(sentSearches()).toEqual([
      { query: 'The Apothecary Diaries', mediaType: 'tv', year: 2023 },
      { query: 'Kusuriya no Hitorigoto', mediaType: 'tv', year: 2023 },
    ]);
    const description = document.querySelector('.c-description')!;
    expect(description.firstElementChild?.id).toBe(SHIKIMORI_CARD_ID);
    expect(description.textContent).toContain('The Apothecary Diaries');
    expect(document.getElementById(SHIKIMORI_SKELETON_ID)).toBeNull();
  });

  it('says nothing was found after every title, naming the Russian one', async () => {
    visit('54492-kusuriya-no-hitorigoto');
    jellyseerrFinds({});

    start();
    await vi.waitFor(() => expect(document.getElementById(SHIKIMORI_CARD_ID)).not.toBeNull());

    expect(sentSearches()).toHaveLength(3);
    expect(document.getElementById(SHIKIMORI_CARD_ID)!.textContent).toContain(
      '"Монолог фармацевта" was not found on Jellyseerr.',
    );
  });

  it('stops at an error instead of trying more titles', async () => {
    visit('54492-kusuriya-no-hitorigoto');
    mockedSend.mockImplementation(async (message: { type: string }) =>
      message.type === 'GET_CONFIG'
        ? { type: 'GET_CONFIG_RESPONSE', payload: { serverType: 'jellyfin' } }
        : searchResponse([], { error: 'Jellyseerr is unreachable' }),
    );

    start();
    await vi.waitFor(() => expect(document.getElementById(SHIKIMORI_CARD_ID)).not.toBeNull());

    expect(sentSearches()).toHaveLength(1);
    expect(document.getElementById(SHIKIMORI_CARD_ID)!.textContent).toContain(
      'Jellyseerr is unreachable',
    );
  });

  it('follows Turbolinks visits and keeps the card out of its page cache', async () => {
    visit('54492-kusuriya-no-hitorigoto');
    jellyseerrFinds({
      'The Apothecary Diaries': [result('The Apothecary Diaries')],
      'Your Name.': [result('Your Name.', 'movie')],
    });
    start();
    await vi.waitFor(() => expect(document.getElementById(SHIKIMORI_CARD_ID)).not.toBeNull());

    // Leaving the page: Turbolinks snapshots it first.
    document.dispatchEvent(new Event('turbolinks:before-cache'));
    expect(document.getElementById(SHIKIMORI_CARD_ID)).toBeNull();

    visit('32281-kimi-no-na-wa');
    document.dispatchEvent(new Event('turbolinks:load'));
    await vi.waitFor(() =>
      expect(document.getElementById(SHIKIMORI_CARD_ID)?.textContent).toContain('Your Name.'),
    );

    // Back to the first anime: the card comes from memory, no new search.
    document.dispatchEvent(new Event('turbolinks:before-cache'));
    visit('54492-kusuriya-no-hitorigoto');
    document.dispatchEvent(new Event('turbolinks:load'));
    await flush();

    expect(document.getElementById(SHIKIMORI_CARD_ID)?.textContent).toContain(
      'The Apothecary Diaries',
    );
    expect(sentSearches()).toEqual([
      { query: 'The Apothecary Diaries', mediaType: 'tv', year: 2023 },
      { query: 'Your Name.', mediaType: 'movie', year: 2016 },
    ]);
  });

  it('does nothing off anime pages', async () => {
    setUrl('https://shikimori.io/animes');
    document.body.innerHTML = '<h1>Аниме</h1>';
    jellyseerrFinds({});

    start();
    await flush();

    expect(mockedSend).not.toHaveBeenCalled();
    expect(document.getElementById(SHIKIMORI_CARD_ID)).toBeNull();
  });
});
