import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MEDIA_DIALOG_HOST_ID,
  dialogTargetFromMedia,
  openMediaDialog,
  type MediaDialogTarget,
} from './media-dialog.js';
import type { MediaDetailsResponse } from '../types/messages.js';

vi.mock('./common-ui.js', () => ({
  sendMessage: vi.fn(),
  openInNewTab: vi.fn(),
  openExtensionSettings: vi.fn(),
}));

import { sendMessage, openInNewTab, openExtensionSettings } from './common-ui.js';

const series: MediaDialogTarget = { title: 'Менталист', year: 2008, mediaType: 'series' };

const seriesDetails: MediaDetailsResponse = {
  type: 'MEDIA_DETAILS_RESPONSE',
  payload: {
    serverType: 'jellyfin',
    mediaType: 'series',
    server: {
      state: 'found',
      name: 'The Mentalist',
      year: 2008,
      itemUrl: 'http://jf.test/web/#/details?id=series-1',
    },
    jellyseerr: {
      state: 'found',
      tmdbId: 5920,
      title: 'The Mentalist',
      year: 2008,
      status: 'partial',
      url: 'http://seerr.test/tv/5920',
      requestable: true,
      requests: [{ state: 'pending', requestedBy: 'alice', createdAt: '2026-11-20T10:00:00Z' }],
    },
    seasons: [
      {
        seasonNumber: 1,
        episodeCount: 23,
        serverEpisodeCount: 23,
        status: 'available',
        requestable: false,
      },
      {
        seasonNumber: 2,
        episodeCount: 23,
        serverEpisodeCount: 0,
        status: 'not_requested',
        requestable: true,
      },
      {
        seasonNumber: 3,
        episodeCount: 24,
        serverEpisodeCount: 0,
        status: 'not_requested',
        requestable: true,
      },
    ],
  },
};

const shadow = (): ShadowRoot => document.getElementById(MEDIA_DIALOG_HOST_ID)!.shadowRoot!;
const text = (): string => shadow().textContent?.replace(/\s+/g, ' ') ?? '';
const button = (label: string): HTMLButtonElement =>
  [...shadow().querySelectorAll('button')].find((b) => b.textContent?.includes(label))!;

/** Answer GET_MEDIA_DETAILS with the given details, REQUEST_MEDIA with `request`. */
const answer = (details: unknown, request?: unknown) =>
  vi.mocked(sendMessage).mockImplementation(async (message) => {
    const type = (message as { type: string }).type;
    if (type === 'GET_MEDIA_DETAILS') return details;
    if (type === 'REQUEST_MEDIA') return request;
    return undefined;
  });

describe('media dialog', () => {
  beforeEach(() => {
    vi.mocked(sendMessage).mockReset();
    vi.mocked(openInNewTab).mockReset();
    vi.mocked(openExtensionSettings).mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows the title on the server, in Jellyseerr and its seasons', async () => {
    answer(seriesDetails);
    openMediaDialog(series);

    expect(shadow().querySelector('dialog')?.open).toBe(true);
    expect(sendMessage).toHaveBeenCalledWith({ type: 'GET_MEDIA_DETAILS', payload: series });

    await vi.waitFor(() => expect(text()).toContain('On Jellyfin: The Mentalist'));
    expect(text()).toContain('Season 1');
    expect(text()).toContain('23 of 23 on the server');
    expect(text()).toContain('Requested by alice');
    expect(text()).toContain('awaiting approval');

    const boxes = [...shadow().querySelectorAll<HTMLInputElement>('.seasons input')];
    expect(boxes.map((b) => [b.checked, b.disabled])).toEqual([
      [false, true],
      [true, false],
      [true, false],
    ]);
    expect(button('Request seasons').textContent).toContain('(2)');

    button('Open in Jellyfin').click();
    expect(openInNewTab).toHaveBeenCalledWith('http://jf.test/web/#/details?id=series-1');
    button('Open in Jellyseerr').click();
    expect(openInNewTab).toHaveBeenCalledWith('http://seerr.test/tv/5920');
  });

  it('requests the selected seasons and shows the new state', async () => {
    answer(seriesDetails, {
      type: 'REQUEST_MEDIA_RESPONSE',
      payload: { success: true, message: 'Request submitted.' },
    });
    openMediaDialog(series);
    await vi.waitFor(() => expect(text()).toContain('Season 3'));

    const season2 = shadow().querySelectorAll<HTMLInputElement>('.seasons input')[1];
    season2.checked = false;
    season2.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(button('Request seasons').textContent).toContain('(1)'));

    button('Request seasons').click();

    await vi.waitFor(() => expect(text()).toContain('Request submitted.'));
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'REQUEST_MEDIA',
      payload: {
        title: 'Менталист',
        year: 2008,
        tmdbId: '5920',
        mediaType: 'series',
        seasons: [3],
      },
    });
    // The details are loaded again after the request
    expect(
      vi
        .mocked(sendMessage)
        .mock.calls.filter(([m]) => (m as { type: string }).type === 'GET_MEDIA_DETAILS'),
    ).toHaveLength(2);
  });

  it('keeps the dialog open with the reason when a request fails', async () => {
    const movie: MediaDialogTarget = { title: 'The Matrix', year: 1999, mediaType: 'movie' };
    answer(
      {
        type: 'MEDIA_DETAILS_RESPONSE',
        payload: {
          ...seriesDetails.payload,
          mediaType: 'movie',
          server: { state: 'missing' },
          jellyseerr: {
            ...seriesDetails.payload.jellyseerr,
            tmdbId: 603,
            status: 'not_requested',
            requests: [],
          },
          seasons: [],
        },
      },
      { type: 'REQUEST_MEDIA_RESPONSE', payload: { success: false, message: 'CSRF token' } },
    );
    openMediaDialog(movie);
    await vi.waitFor(() => expect(text()).toContain('Not on Jellyfin.'));

    button('Request').click();
    await vi.waitFor(() => expect(text()).toContain('CSRF token'));
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'REQUEST_MEDIA',
      payload: { title: 'The Matrix', year: 1999, tmdbId: '603', mediaType: 'movie' },
    });
    expect(shadow().querySelector('.result.fail')).not.toBeNull();
  });

  it('points to the settings when nothing is set up', async () => {
    answer({
      type: 'MEDIA_DETAILS_RESPONSE',
      payload: {
        serverType: 'emby',
        mediaType: 'movie',
        server: { state: 'unconfigured' },
        jellyseerr: { state: 'disabled' },
        seasons: [],
      },
    });
    openMediaDialog({ title: 'Dune', mediaType: 'movie' });
    await vi.waitFor(() => expect(text()).toContain('Emby is not set up in the extension.'));
    expect(text()).toContain('Jellyseerr is not set up in the extension.');

    button('Open settings').click();
    expect(openExtensionSettings).toHaveBeenCalled();
  });

  it('says so when the details cannot be loaded', async () => {
    answer({ type: 'ERROR', payload: { message: 'Storage failed' } });
    openMediaDialog(series);
    await vi.waitFor(() => expect(text()).toContain('Could not load the details: Storage failed'));
  });

  it('closes and removes itself', async () => {
    answer(seriesDetails);
    openMediaDialog(series);
    await vi.waitFor(() => expect(text()).toContain('Season 1'));

    shadow().querySelector<HTMLButtonElement>('button.close')!.click();
    await vi.waitFor(() => expect(document.getElementById(MEDIA_DIALOG_HOST_ID)).toBeNull());
  });

  it('keeps keys typed in the dialog from the site', async () => {
    answer(seriesDetails);
    const onKey = vi.fn();
    document.addEventListener('keydown', onKey);
    openMediaDialog(series);

    shadow()
      .querySelector('button.close')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true, composed: true }));
    expect(onKey).not.toHaveBeenCalled();
    document.removeEventListener('keydown', onKey);
  });

  it('replaces a dialog that is already open', () => {
    answer(seriesDetails);
    openMediaDialog(series);
    openMediaDialog({ title: 'Dune', mediaType: 'movie' });
    expect(document.querySelectorAll(`#${MEDIA_DIALOG_HOST_ID}`)).toHaveLength(1);
  });
});

describe('dialogTargetFromMedia', () => {
  it('takes the series of a detected episode', () => {
    expect(
      dialogTargetFromMedia({
        type: 'episode',
        seriesTitle: 'The Mentalist',
        seasonNumber: 2,
        episodeNumber: 3,
        year: 2008,
        imdbId: 'tt1196946',
      }),
    ).toEqual({
      title: 'The Mentalist',
      year: 2008,
      imdbId: 'tt1196946',
      tmdbId: undefined,
      mediaType: 'series',
    });
  });

  it('keeps a movie a movie', () => {
    expect(dialogTargetFromMedia({ type: 'movie', title: 'Dune', year: 2021 }).mediaType).toBe(
      'movie',
    );
  });
});
