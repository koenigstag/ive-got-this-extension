import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../common-ui.js', async () => {
  const actual = await vi.importActual('../common-ui.js');
  return { ...actual, sendMessage: vi.fn(), injectSkeletonKeyframes: vi.fn() };
});

import { sendMessage } from '../common-ui.js';
import { initTmdb, TMDB_CARD_ID, TMDB_SKELETON_ID } from './tmdb.js';
import type { SearchJellyseerrResponse } from '../../types/messages.js';

const mockedSend = vi.mocked(sendMessage);

const setUrl = (url: string): void => {
  Object.defineProperty(window, 'location', {
    value: new URL(url),
    writable: true,
    configurable: true,
  });
};

const searchResponse = (
  overrides: Partial<SearchJellyseerrResponse['payload']> = {},
): SearchJellyseerrResponse => ({
  type: 'SEARCH_JELLYSEERR_RESPONSE',
  payload: {
    results: [
      {
        id: 220542,
        title: 'The Apothecary Diaries',
        year: 2023,
        mediaType: 'tv',
        overview: 'Overview',
        status: 'partial',
      },
    ],
    jellyseerrEnabled: true,
    serverType: 'jellyfin',
    jellyseerrUrl: 'http://localhost:5055',
    ...overrides,
  },
});

const renderTitlePage = (): void => {
  setUrl('https://www.themoviedb.org/tv/220542-kusuriya-no-hitorigoto');
  document.body.innerHTML = `
    <section class="inner_content tv_content backdrop poster">
      <section class="header poster"><div class="title">
        <h2><a href="/tv/220542">Монолог фармацевта</a> <span class="tag release_date">(2023)</span></h2>
      </div></section>
      <div class="column_wrapper"><div class="content_wrapper"><div>
        <div class="white_column">
          <section class="panel top_billed scroller">В главных ролях</section>
        </div>
      </div></div></div>
    </section>`;
};

const respondWith = (response: SearchJellyseerrResponse): void => {
  mockedSend.mockImplementation(async (message: { type: string }) =>
    message.type === 'GET_CONFIG'
      ? { type: 'GET_CONFIG_RESPONSE', payload: { serverType: 'jellyfin' } }
      : response,
  );
};

describe('TMDB card', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    mockedSend.mockReset();
  });

  it('asks Jellyseerr for the TMDB id of the page and puts the card above the cast', async () => {
    renderTitlePage();
    respondWith(searchResponse());

    await initTmdb();

    const searches = mockedSend.mock.calls
      .map(([message]) => message as { type: string; payload?: unknown })
      .filter((message) => message.type === 'SEARCH_JELLYSEERR');
    expect(searches.map((message) => message.payload)).toEqual([
      { query: 'Монолог фармацевта', mediaType: 'tv', year: 2023, tmdbId: 220542 },
    ]);
    const column = document.querySelector('.white_column')!;
    expect(column.firstElementChild?.id).toBe(TMDB_CARD_ID);
    expect(column.firstElementChild?.textContent).toContain('The Apothecary Diaries');
    expect(document.getElementById(TMDB_SKELETON_ID)).toBeNull();
  });

  it('shows an error from Jellyseerr', async () => {
    renderTitlePage();
    respondWith(searchResponse({ results: [], error: 'Jellyseerr responded with 404' }));

    await initTmdb();

    expect(document.getElementById(TMDB_CARD_ID)?.textContent).toContain(
      'Jellyseerr responded with 404',
    );
  });

  it("does nothing on TMDB's browser check, served at the title's URL", async () => {
    setUrl('https://www.themoviedb.org/tv/220542-kusuriya-no-hitorigoto');
    document.body.innerHTML = '<h1>Checking your browser...</h1>';
    respondWith(searchResponse());

    await initTmdb();

    expect(mockedSend).not.toHaveBeenCalled();
    expect(document.getElementById(TMDB_CARD_ID)).toBeNull();
  });

  it('does nothing off title pages', async () => {
    setUrl('https://www.themoviedb.org/tv/220542/season/1');
    respondWith(searchResponse());

    await initTmdb();

    expect(mockedSend).not.toHaveBeenCalled();
    expect(document.getElementById(TMDB_CARD_ID)).toBeNull();
  });
});
