import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildProwlarrSearchUrl, createNotFoundRows } from './common-ui.js';
import type { SearchJellyseerrResponse } from '../types/messages.js';

const notFound = (
  overrides: Partial<SearchJellyseerrResponse['payload']> = {},
): SearchJellyseerrResponse => ({
  type: 'SEARCH_JELLYSEERR_RESPONSE',
  payload: {
    results: [],
    jellyseerrEnabled: true,
    serverType: 'jellyfin',
    jellyseerrUrl: 'http://jellyseer.home',
    ...overrides,
  },
});

describe('buildProwlarrSearchUrl', () => {
  it.each([
    ['movie', '2000'],
    ['tv', '5000'],
    [undefined, '2000,5000'],
  ] as const)('searches the %s categories', (mediaType, categories) => {
    expect(buildProwlarrSearchUrl('http://prowlarr.lab.home/', 'Холод', mediaType)).toBe(
      `http://prowlarr.lab.home/search?query=%D0%A5%D0%BE%D0%BB%D0%BE%D0%B4&categories=${categories}`,
    );
  });
});

describe('createNotFoundRows', () => {
  let sendMessage: ReturnType<typeof vi.fn>;
  const open = vi.fn();

  beforeEach(() => {
    sendMessage = vi.fn((_msg: unknown, cb: (response: unknown) => void) => cb({}));
    vi.stubGlobal('chrome', { runtime: { id: 'mock-id', sendMessage, lastError: null } });
    vi.stubGlobal('open', open);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('says "No results", with no buttons, when nothing else is known', () => {
    const rows = createNotFoundRows(notFound(), 'Холод', 'tv');

    expect(rows.textContent).toContain('No results');
    expect(rows.textContent).toContain('"Холод" was not found on Jellyseerr.');
    expect(rows.querySelectorAll('button')).toHaveLength(0);
  });

  it('shows the title the server has under that name, with a Play button', () => {
    const rows = createNotFoundRows(
      notFound({
        serverMatch: { status: 'available', itemUrl: 'http://jellyfin.home/web/#/details?id=1' },
      }),
      'Холод',
      'tv',
    );

    expect(rows.textContent).toContain('Available on Jellyfin');
    expect(rows.textContent).toContain('Found by the title "Холод"');
    const play = rows.querySelector<HTMLButtonElement>('[data-action="play-on-server"]')!;
    expect(play.textContent).toContain('Play on Jellyfin');
    play.click();
    expect(open).toHaveBeenCalledWith('http://jellyfin.home/web/#/details?id=1', '_blank');
  });

  it("opens Prowlarr's search for the title in a new tab", () => {
    const rows = createNotFoundRows(
      notFound({ prowlarrUrl: 'http://prowlarr.lab.home' }),
      'Холод',
      'tv',
    );

    const find = rows.querySelector<HTMLButtonElement>('[data-action="find-release"]')!;
    expect(find.textContent).toContain('Find a release');
    expect(find.querySelector('svg[viewBox="0 0 1024 1024"]')).not.toBeNull(); // Prowlarr's logo
    find.click();
    expect(sendMessage).toHaveBeenCalledWith(
      {
        type: 'OPEN_TAB',
        payload: {
          url: 'http://prowlarr.lab.home/search?query=%D0%A5%D0%BE%D0%BB%D0%BE%D0%B4&categories=5000',
        },
      },
      expect.any(Function),
    );
  });
});
