import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initIvi, injectIviCard, IVI_CARD_ID } from './ivi.js';
import type { SearchJellyseerrResponse } from '../../types/messages.js';

vi.mock('../common-ui.js', async () => {
  const actual = await vi.importActual('../common-ui.js');
  return {
    ...actual,
    sendMessage: vi.fn(),
    injectSkeletonKeyframes: vi.fn(),
  };
});

// index.ts starts the content script on import, so only its detector is kept.
vi.mock('../index.js', async () => {
  const { detectMedia } =
    await vi.importActual<typeof import('../detect-media.js')>('../detect-media.js');
  return { tryDetectMedia: vi.fn(() => detectMedia()) };
});

// Mutations are fired by hand.
let mutationCallback: () => void = () => {};
(global as unknown as { MutationObserver: unknown }).MutationObserver = vi.fn(function (
  callback: () => void,
) {
  mutationCallback = callback;
  (this as unknown as { observe: () => void }).observe = vi.fn();
  (this as unknown as { disconnect: () => void }).disconnect = vi.fn();
});

import { sendMessage } from '../common-ui.js';

const searchResponse = (
  title: string,
  overrides: Partial<SearchJellyseerrResponse['payload']> = {},
): SearchJellyseerrResponse => ({
  type: 'SEARCH_JELLYSEERR_RESPONSE',
  payload: {
    results: [
      {
        id: 154321,
        title,
        year: 2022,
        mediaType: 'tv',
        overview: 'Overview',
        status: 'not_requested',
      },
    ],
    jellyseerrEnabled: true,
    serverType: 'jellyfin',
    jellyseerrUrl: 'http://localhost:5055',
    ...overrides,
  },
});

const setUrl = (url: string): void => {
  Object.defineProperty(window, 'location', {
    value: new URL(url),
    writable: true,
    configurable: true,
  });
};

/** Change what the page shows, the way ivi does after in-app navigation. */
const showTitle = (ogTitle: string, heading: string): void => {
  document.querySelector('meta[property="og:title"]')!.setAttribute('content', ogTitle);
  document.querySelector('h1')!.textContent = heading;
};

const searches = (): string[] =>
  vi
    .mocked(sendMessage)
    .mock.calls.map(([msg]) => msg as { type: string; payload?: { query: string } })
    .filter((msg) => msg.type === 'SEARCH_JELLYSEERR')
    .map((msg) => msg.payload!.query);

/** Fire a DOM mutation and let the throttled check and its messages finish. */
const mutate = async (ms = 500): Promise<void> => {
  mutationCallback();
  await vi.advanceTimersByTimeAsync(ms);
};

describe('ivi', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setUrl('https://www.ivi.ru/watch/himera');
    document.head.innerHTML = '<meta property="og:title" content="Химера — на Иви!">';
    document.body.innerHTML = `
      <div class="enterprise">
        <div class="oversideTrailer">
          <div class="meta">
            <h1>Сериал Химера смотреть онлайн</h1>
            <div data-test="serieBadge"><button>Серия 1 сезон 1</button></div>
            <div data-test="meta_params">
              <div>8,6</div><a href="/series/2022">2022</a><div>1 сезон</div><div>18+</div>
            </div>
          </div>
        </div>
        <div class="underside"><section data-test="underside_series_list">Серии</section></div>
      </div>
    `;
    vi.mocked(sendMessage).mockImplementation(async (msg: unknown) => {
      const m = msg as { type: string; payload?: { query: string } };
      if (m.type === 'GET_CONFIG') return { payload: { serverType: 'jellyfin' } };
      if (m.type === 'SEARCH_JELLYSEERR') return searchResponse(m.payload!.query);
      return undefined;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('searches by the title and year and puts the card between the hero and the episodes', async () => {
    initIvi();
    await vi.advanceTimersByTimeAsync(0);

    expect(sendMessage).toHaveBeenCalledWith({
      type: 'SEARCH_JELLYSEERR',
      payload: { query: 'Химера', mediaType: 'tv', year: 2022 },
    });
    const card = document.getElementById(IVI_CARD_ID);
    expect(card).not.toBeNull();
    expect(card!.textContent).toContain('Химера');
    expect(card!.nextElementSibling?.classList.contains('underside')).toBe(true);
  });

  it('does nothing off the title pages', async () => {
    setUrl('https://www.ivi.ru/series/2022');
    initIvi();
    await vi.advanceTimersByTimeAsync(0);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(document.getElementById(IVI_CARD_ID)).toBeNull();
  });

  it('keeps one card for the episode pages of the same show', async () => {
    initIvi();
    await vi.advanceTimersByTimeAsync(0);

    setUrl('https://www.ivi.ru/watch/himera/495880');
    showTitle('Химера 1 сезон 3 серия', 'Химера 1 сезон 3 серия смотреть онлайн');
    await mutate();

    expect(searches()).toEqual(['Химера']);
    expect(document.getElementById(IVI_CARD_ID)).not.toBeNull();
  });

  it('replaces the card after in-app navigation to another title', async () => {
    initIvi();
    await vi.advanceTimersByTimeAsync(0);

    setUrl('https://www.ivi.ru/watch/vozmezdiye-2019');
    showTitle('Возмездие (2019) — на Иви!', 'Сериал Возмездие (2019) смотреть онлайн');
    await mutate();

    expect(searches()).toEqual(['Химера', 'Возмездие']);
    const cards = document.querySelectorAll(`#${IVI_CARD_ID}`);
    expect(cards).toHaveLength(1);
    expect(cards[0].textContent).toContain('Возмездие');
  });

  it('waits for the new page when the URL changes before the content', async () => {
    initIvi();
    await vi.advanceTimersByTimeAsync(0);

    // The URL is new, the page still shows the previous title.
    setUrl('https://www.ivi.ru/watch/vozmezdiye-2019');
    await mutate();
    expect(searches()).toEqual(['Химера']);
    expect(document.getElementById(IVI_CARD_ID)).toBeNull();

    showTitle('Возмездие (2019) — на Иви!', 'Сериал Возмездие (2019) смотреть онлайн');
    await mutate();
    expect(searches()).toEqual(['Химера', 'Возмездие']);
  });

  it('takes an unchanged page as real once the wait is over', async () => {
    initIvi();
    await vi.advanceTimersByTimeAsync(0);

    setUrl('https://www.ivi.ru/watch/himera-2');
    await mutate();
    expect(searches()).toEqual(['Химера']);

    await vi.advanceTimersByTimeAsync(3000);
    expect(searches()).toEqual(['Химера', 'Химера']);
  });

  it('removes the card when leaving the title pages', async () => {
    initIvi();
    await vi.advanceTimersByTimeAsync(0);

    setUrl('https://www.ivi.ru/series');
    await mutate();

    expect(document.getElementById(IVI_CARD_ID)).toBeNull();
  });

  it('puts back a card the page removed without searching again', async () => {
    initIvi();
    await vi.advanceTimersByTimeAsync(0);

    document.getElementById(IVI_CARD_ID)!.remove();
    await mutate();

    expect(searches()).toEqual(['Химера']);
    expect(document.getElementById(IVI_CARD_ID)).not.toBeNull();
  });

  it('does not repeat a search that got no answer', async () => {
    vi.mocked(sendMessage).mockImplementation(async (msg: unknown) =>
      (msg as { type: string }).type === 'GET_CONFIG'
        ? { payload: { serverType: 'emby' } }
        : undefined,
    );
    initIvi();
    await vi.advanceTimersByTimeAsync(0);
    await mutate();
    await mutate();

    expect(searches()).toEqual(['Химера']);
    expect(document.getElementById(IVI_CARD_ID)).toBeNull();
  });

  describe('injectIviCard', () => {
    it('explains when Jellyseerr is not configured', () => {
      injectIviCard(searchResponse('Химера', { jellyseerrEnabled: false, results: [] }), 'Химера');
      expect(document.getElementById(IVI_CARD_ID)!.textContent).toContain(
        'Jellyseerr not configured',
      );
    });

    it('shows a connection error', () => {
      injectIviCard(searchResponse('Химера', { error: 'Jellyseerr is unreachable' }), 'Химера');
      expect(document.getElementById(IVI_CARD_ID)!.textContent).toContain(
        'Jellyseerr is unreachable',
      );
    });

    it('says when nothing was found', () => {
      injectIviCard(searchResponse('Травля', { results: [] }), 'Травля');
      expect(document.getElementById(IVI_CARD_ID)!.textContent).toContain(
        '"Травля" was not found on Jellyseerr.',
      );
    });

    it('falls back to the top of the page without the ivi layout', () => {
      document.body.innerHTML = '<main><p>content</p></main>';
      injectIviCard(searchResponse('Химера'), 'Химера');
      expect(document.querySelector('main')!.firstElementChild?.id).toBe(IVI_CARD_ID);
    });
  });
});
