import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initSearchEngineSidebar,
  initYandexSearch,
  tryInjectSearchEngineCard,
} from './search-engine.js';
import type { CheckMediaResponse } from '../../types/messages.js';

// Mock the common-ui module
vi.mock('../common-ui.js', async () => {
  const actual = await vi.importActual('../common-ui.js');
  return {
    ...actual,
    sendMessage: vi.fn(),
    injectSkeletonKeyframes: vi.fn(),
  };
});

// Mock the index module
vi.mock('../index.js', () => ({
  tryDetectMedia: vi.fn(),
  identifySite: vi.fn(),
}));

import { sendMessage } from '../common-ui.js';
import { tryDetectMedia, identifySite } from '../index.js';

describe('Search Engine Injection', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="rhs"></div>
      <div id="b_context"></div>
      <div id="rso"></div>
      <div id="b_results"></div>
    `;
    vi.mocked(identifySite).mockReturnValue('google');
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  describe('initSearchEngineSidebar', () => {
    it('returns early if no media is detected', async () => {
      vi.mocked(tryDetectMedia).mockReturnValue(undefined);
      await initSearchEngineSidebar();
      expect(document.getElementById('media-connector-skeleton')).toBeNull();
    });

    it('detects media and injects sidebar for Google', async () => {
      vi.mocked(tryDetectMedia).mockReturnValue({
        type: 'movie',
        title: 'The Matrix',
        year: 1999,
      });
      vi.mocked(identifySite).mockReturnValue('google');
      vi.mocked(sendMessage).mockImplementation(async (msg: unknown) => {
        const m = msg as { type: string };
        if (m.type === 'GET_CONFIG') return { payload: { serverType: 'emby' } };
        if (m.type === 'SEARCH_JELLYSEERR') {
          return {
            payload: {
              results: [{ id: 603, title: 'The Matrix', status: 'available', mediaType: 'movie' }],
              jellyseerrEnabled: true,
              serverType: 'emby',
            },
          };
        }
        return undefined;
      });

      await initSearchEngineSidebar();

      const card = document.getElementById('media-connector-sidebar');
      expect(card).to.exist;
      expect(document.getElementById('rso')?.previousElementSibling).to.equal(card);
    });

    it('injects into center_col if rso is missing in Google', async () => {
      document.getElementById('rso')?.remove();
      const centerCol = document.createElement('div');
      centerCol.id = 'center_col';
      document.body.appendChild(centerCol);

      vi.mocked(tryDetectMedia).mockReturnValue({ type: 'movie', title: 'Test' });
      vi.mocked(identifySite).mockReturnValue('google');
      vi.mocked(sendMessage).mockResolvedValue({
        payload: {
          results: [{ title: 'Test', status: 'available', mediaType: 'movie' }],
          jellyseerrEnabled: true,
        },
      });

      await initSearchEngineSidebar();
      expect(centerCol.firstChild?.id).toBe('media-connector-sidebar');
    });

    it('injects into search if center_col is missing in Google', async () => {
      document.getElementById('rso')?.remove();
      const search = document.createElement('div');
      search.id = 'search';
      document.body.appendChild(search);

      vi.mocked(tryDetectMedia).mockReturnValue({ type: 'movie', title: 'Test' });
      vi.mocked(identifySite).mockReturnValue('google');
      vi.mocked(sendMessage).mockResolvedValue({
        payload: {
          results: [{ title: 'Test', status: 'available', mediaType: 'movie' }],
          jellyseerrEnabled: true,
        },
      });

      await initSearchEngineSidebar();
      expect(search.firstChild?.id).toBe('media-connector-sidebar');
    });

    it('detects media and injects sidebar for Bing', async () => {
      vi.mocked(tryDetectMedia).mockReturnValue({
        type: 'movie',
        title: 'The Matrix',
        year: 1999,
      });
      vi.mocked(identifySite).mockReturnValue('bing');
      vi.mocked(sendMessage).mockImplementation(async (msg: unknown) => {
        const m = msg as { type: string };
        if (m.type === 'GET_CONFIG') return { payload: { serverType: 'emby' } };
        if (m.type === 'SEARCH_JELLYSEERR') {
          return {
            payload: {
              results: [{ id: 603, title: 'The Matrix', status: 'available', mediaType: 'movie' }],
              jellyseerrEnabled: true,
              serverType: 'emby',
            },
          };
        }
        return undefined;
      });

      await initSearchEngineSidebar();

      const card = document.getElementById('media-connector-sidebar');
      expect(card).to.exist;
      expect(document.getElementById('b_results')?.previousElementSibling).to.equal(card);
    });

    it('injects into b_content if b_results is missing in Bing', async () => {
      document.getElementById('b_results')?.remove();
      const bContent = document.createElement('div');
      bContent.id = 'b_content';
      document.body.appendChild(bContent);

      vi.mocked(tryDetectMedia).mockReturnValue({ type: 'movie', title: 'Test' });
      vi.mocked(identifySite).mockReturnValue('bing');
      vi.mocked(sendMessage).mockResolvedValue({
        payload: {
          results: [{ title: 'Test', status: 'available', mediaType: 'movie' }],
          jellyseerrEnabled: true,
        },
      });

      await initSearchEngineSidebar();
      expect(bContent.firstChild?.id).toBe('media-connector-sidebar');
    });

    it('uses different selectors for Google center_col and search branches', async () => {
      // Test center_col branch
      document.body.innerHTML = '<div id="center_col"></div>';
      vi.mocked(identifySite).mockReturnValue('google');
      await initSearchEngineSidebar();
      expect(document.getElementById('center_col')?.firstChild).to.exist;

      // Test search branch
      document.body.innerHTML = '<div id="search"></div>';
      vi.mocked(identifySite).mockReturnValue('google');
      await initSearchEngineSidebar();
      expect(document.getElementById('search')?.firstChild).to.exist;
    });

    describe('Yandex', () => {
      beforeEach(() => {
        vi.mocked(identifySite).mockReturnValue('yandex');
        vi.mocked(tryDetectMedia).mockReturnValue({ type: 'movie', title: 'Матрица', year: 1999 });
        vi.mocked(sendMessage).mockResolvedValue({
          payload: {
            results: [{ title: 'Матрица', status: 'available', mediaType: 'movie' }],
            jellyseerrEnabled: true,
          },
        });
      });

      it('goes right above the film card, even in a column with scrambled classes', async () => {
        document.body.innerHTML = `
          <div class="content">
            <div class="rpHjKUab1AIAR"><ul class="rtHLWV673Haw6"><li>result</li></ul></div>
            <div class="rpHjKUab1AIARpG826C0">
              <div class="rtHLWV673Haw6">
                <div id="film-item" class="rtHLWV67yALoj card__narrow"><div class="EntityCard EntityCard_film"></div></div>
                <div id="other-item" class="rtHLWV67yALoj card__narrow"></div>
              </div>
            </div>
          </div>
        `;

        await initSearchEngineSidebar();

        const card = document.getElementById('media-connector-sidebar');
        expect(card).to.exist;
        expect(card?.nextElementSibling?.id).toBe('film-item');
        expect(card?.style.width).toBe('100%');
      });

      it('goes to the top of the right column when there is no film card in it', async () => {
        document.body.innerHTML = `
          <div class="content">
            <div class="content__left"><ul id="search-result"></ul></div>
            <div id="search-result-aside" class="content__right"><div id="first"></div></div>
          </div>
        `;

        await initSearchEngineSidebar();

        const aside = document.getElementById('search-result-aside');
        expect((aside?.firstElementChild as HTMLElement | null)?.id).toBe(
          'media-connector-sidebar',
        );
      });

      it('goes above the results when there is no right column', async () => {
        document.body.innerHTML = `
          <div class="content"><div class="content__left"><ul id="search-result"></ul></div></div>
        `;

        await initSearchEngineSidebar();

        expect(document.getElementById('search-result')?.previousElementSibling?.id).toBe(
          'media-connector-sidebar',
        );
      });
    });

    it('falls back to fixed positioning if no site matches', async () => {
      vi.mocked(identifySite).mockReturnValue('unknown');
      vi.mocked(tryDetectMedia).mockReturnValue({ type: 'movie', title: 'Test' });
      vi.mocked(sendMessage).mockResolvedValue({
        payload: {
          results: [{ title: 'Test', status: 'available', mediaType: 'movie' }],
          jellyseerrEnabled: true,
        },
      });

      await initSearchEngineSidebar();
      const card = document.getElementById('media-connector-sidebar');
      expect(card?.style.position).toBe('fixed');
    });
  });

  describe('initYandexSearch', () => {
    const matrix = { type: 'movie', title: 'Матрица', year: 1999 } as const;
    const breakingBad = { type: 'series', title: 'Во все тяжкие', year: 2008 } as const;
    const yandexPage = `
      <div class="content">
        <div class="content__left"><ul id="search-result"></ul></div>
        <div id="search-result-aside" class="content__right">
          <div class="card__narrow"><div class="EntityCard EntityCard_film"></div></div>
        </div>
      </div>
    `;
    const searches = (): string[] =>
      vi
        .mocked(sendMessage)
        .mock.calls.map(([message]) => message as { type: string; payload?: { query: string } })
        .filter((message) => message.type === 'SEARCH_JELLYSEERR')
        .map((message) => message.payload!.query);

    let stop: () => void = () => {};

    beforeEach(() => {
      vi.useFakeTimers();
      document.body.innerHTML = yandexPage;
      vi.mocked(identifySite).mockReturnValue('yandex');
      vi.mocked(tryDetectMedia).mockReturnValue(matrix);
      vi.mocked(sendMessage).mockImplementation(async (msg: unknown) => {
        const m = msg as { type: string };
        if (m.type === 'GET_CONFIG') return { payload: { serverType: 'jellyfin' } };
        return {
          payload: {
            results: [{ title: 'x', status: 'available', mediaType: 'movie' }],
            jellyseerrEnabled: true,
          },
        };
      });
    });

    afterEach(() => {
      stop();
      vi.useRealTimers();
    });

    it('searches the title on the page right away', async () => {
      stop = initYandexSearch();
      await vi.advanceTimersByTimeAsync(0);

      expect(searches()).toEqual(['Матрица']);
      expect(document.getElementById('media-connector-sidebar')).to.exist;
    });

    it('follows a new search that Yandex swaps in without loading a page', async () => {
      stop = initYandexSearch();
      await vi.advanceTimersByTimeAsync(0);

      document.body.innerHTML = yandexPage;
      vi.mocked(tryDetectMedia).mockReturnValue(breakingBad);
      await vi.advanceTimersByTimeAsync(2000);

      expect(searches()).toEqual(['Матрица', 'Во все тяжкие']);
      expect(document.querySelectorAll('#media-connector-sidebar')).toHaveLength(1);
    });

    it('waits for the new title to settle before searching it', async () => {
      stop = initYandexSearch();
      await vi.advanceTimersByTimeAsync(0);

      // Half-way through the swap the page shows something else for a moment.
      vi.mocked(tryDetectMedia).mockReturnValue({ type: 'movie', title: 'Матрица: Перезагрузка' });
      await vi.advanceTimersByTimeAsync(500);
      vi.mocked(tryDetectMedia).mockReturnValue(breakingBad);
      await vi.advanceTimersByTimeAsync(2000);

      expect(searches()).toEqual(['Матрица', 'Во все тяжкие']);
    });

    it('puts the sidebar back when Yandex re-renders the column, without a new search', async () => {
      stop = initYandexSearch();
      await vi.advanceTimersByTimeAsync(0);

      document.body.innerHTML = yandexPage;
      expect(document.getElementById('media-connector-sidebar')).toBeNull();
      await vi.advanceTimersByTimeAsync(1000);

      expect(searches()).toEqual(['Матрица']);
      const card = document.getElementById('media-connector-sidebar');
      expect(card?.nextElementSibling?.querySelector('.EntityCard_film')).to.exist;
    });

    it('removes the sidebar when the new results have no film', async () => {
      stop = initYandexSearch();
      await vi.advanceTimersByTimeAsync(0);

      vi.mocked(tryDetectMedia).mockReturnValue(undefined);
      await vi.advanceTimersByTimeAsync(2000);

      expect(document.getElementById('media-connector-sidebar')).toBeNull();
      expect(searches()).toEqual(['Матрица']);
    });
  });

  describe('a page that moves on while Jellyseerr answers', () => {
    it('drops the answer instead of showing it for the wrong title', async () => {
      document.body.innerHTML = '<div id="search-result-aside"></div>';
      vi.mocked(identifySite).mockReturnValue('yandex');
      vi.mocked(tryDetectMedia)
        .mockReturnValueOnce({ type: 'movie', title: 'Матрица', year: 1999 })
        .mockReturnValue({ type: 'series', title: 'Во все тяжкие', year: 2008 });
      vi.mocked(sendMessage).mockResolvedValue({
        payload: { results: [{ title: 'Матрица', status: 'available', mediaType: 'movie' }] },
      });

      await initSearchEngineSidebar();

      expect(document.getElementById('media-connector-sidebar')).toBeNull();
    });
  });

  describe('tryInjectSearchEngineCard', () => {
    it('injects card into Google sidebar (rhs)', () => {
      const response: CheckMediaResponse = {
        type: 'CHECK_MEDIA_RESPONSE',
        payload: { status: 'available', serverType: 'emby', itemUrl: 'url' },
      };

      tryInjectSearchEngineCard(response);

      const card = document.getElementById('media-connector-search-card');
      expect(card).to.exist;
      expect(document.getElementById('rhs')?.contains(card!)).to.be.true;
    });

    it('injects card into Bing sidebar (b_context)', () => {
      document.getElementById('rhs')?.remove();
      const response: CheckMediaResponse = {
        type: 'CHECK_MEDIA_RESPONSE',
        payload: { status: 'available', serverType: 'jellyfin', itemUrl: 'url' },
      };

      tryInjectSearchEngineCard(response);

      const card = document.getElementById('media-connector-search-card');
      expect(card).to.exist;
      expect(document.getElementById('b_context')?.contains(card!)).to.be.true;
    });

    it('falls back to fixed positioning if no sidebars found', () => {
      document.getElementById('rhs')?.remove();
      document.getElementById('b_context')?.remove();
      const response: CheckMediaResponse = {
        type: 'CHECK_MEDIA_RESPONSE',
        payload: { status: 'available', serverType: 'emby', itemUrl: 'url' },
      };

      tryInjectSearchEngineCard(response);
      const card = document.getElementById('media-connector-search-card');
      expect(card?.style.position).toBe('fixed');
    });
  });
});
