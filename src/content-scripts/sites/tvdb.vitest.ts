import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../common-ui.js', async () => {
  const actual = await vi.importActual('../common-ui.js');
  return { ...actual, sendMessage: vi.fn(), injectSkeletonKeyframes: vi.fn() };
});

import { sendMessage } from '../common-ui.js';
import { initTvdb, TVDB_CARD_ID, TVDB_SKELETON_ID } from './tvdb.js';
import type { SearchJellyseerrResponse } from '../../types/messages.js';

const mockedSend = vi.mocked(sendMessage);

const setUrl = (url: string): void => {
  Object.defineProperty(window, 'location', {
    value: new URL(url),
    writable: true,
    configurable: true,
  });
};

const response: SearchJellyseerrResponse = {
  type: 'SEARCH_JELLYSEERR_RESPONSE',
  payload: {
    results: [
      {
        id: 220542,
        title: 'The Apothecary Diaries',
        year: 2023,
        mediaType: 'tv',
        overview: 'Overview',
        status: 'available',
      },
    ],
    jellyseerrEnabled: true,
    serverType: 'jellyfin',
    jellyseerrUrl: 'http://localhost:5055',
  },
};

const renderSeriesPage = (tmdbLink: boolean): void => {
  setUrl('https://www.thetvdb.com/series/kusuriya-no-hitorigoto');
  document.body.innerHTML = `
    <div class="container">
      <div class="row mt-2"><div><h1 id="series_title">The Apothecary Diaries</h1></div></div>
      <div id="tabs">
        <ul class="list-group">
          <li class="list-group-item"><strong>First Aired</strong> October 22, 2023</li>
          ${tmdbLink ? '<li class="list-group-item"><a href="https://www.themoviedb.org/tv/220542">TheMovieDB.com</a></li>' : ''}
        </ul>
      </div>
    </div>`;
};

const sentSearches = () =>
  mockedSend.mock.calls
    .map(([message]) => message as { type: string; payload?: unknown })
    .filter((message) => message.type === 'SEARCH_JELLYSEERR')
    .map((message) => message.payload);

describe('TVDB card', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    mockedSend.mockReset();
    mockedSend.mockImplementation(async (message: { type: string }) =>
      message.type === 'GET_CONFIG'
        ? { type: 'GET_CONFIG_RESPONSE', payload: { serverType: 'jellyfin' } }
        : response,
    );
  });

  it('asks for the linked TMDB id and puts the card under the title block', async () => {
    renderSeriesPage(true);

    await initTvdb();

    expect(sentSearches()).toEqual([
      { query: 'The Apothecary Diaries', mediaType: 'tv', year: 2023, tmdbId: 220542 },
    ]);
    const card = document.getElementById(TVDB_CARD_ID)!;
    expect(card.previousElementSibling?.classList.contains('row')).toBe(true);
    expect(card.nextElementSibling?.id).toBe('tabs');
    expect(card.textContent).toContain('The Apothecary Diaries');
    expect(document.getElementById(TVDB_SKELETON_ID)).toBeNull();
  });

  it('searches by name and year without a TMDB link', async () => {
    renderSeriesPage(false);

    await initTvdb();

    expect(sentSearches()).toEqual([
      { query: 'The Apothecary Diaries', mediaType: 'tv', year: 2023 },
    ]);
  });

  it('does nothing on season pages', async () => {
    setUrl('https://www.thetvdb.com/series/kusuriya-no-hitorigoto/seasons/official/1');

    await initTvdb();

    expect(mockedSend).not.toHaveBeenCalled();
  });
});
