import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { injectStatusIndicator } from './fallback.js';
import { openMediaDialog } from './media-dialog.js';
import type { CheckMediaResponse } from '../types/messages.js';
import type { DetectedMedia } from '../types/index.js';

vi.mock('./media-dialog.js', async () => {
  const actual = await vi.importActual('./media-dialog.js');
  return { ...actual, openMediaDialog: vi.fn() };
});

const movie: DetectedMedia = { type: 'movie', title: 'Glass Onion', year: 2022 };

describe('fallback injection', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('injects available indicator', () => {
    const response: CheckMediaResponse = {
      type: 'CHECK_MEDIA_RESPONSE',
      payload: {
        status: 'available',
        itemUrl: 'https://emby.test/123',
      },
    };

    injectStatusIndicator(response, movie);

    const indicator = document.getElementById('media-connector-indicator');
    expect(indicator).to.exist;
    expect(indicator?.textContent).to.contain('Available on Server');
  });

  it('injects unavailable indicator', () => {
    const response: CheckMediaResponse = {
      type: 'CHECK_MEDIA_RESPONSE',
      payload: {
        status: 'unavailable',
      },
    };

    injectStatusIndicator(response, movie);

    const indicator = document.getElementById('media-connector-indicator');
    expect(indicator?.textContent).to.contain('Request with Jellyseerr');
  });

  it('opens the media dialog for the page title from the request indicator', () => {
    const response: CheckMediaResponse = {
      type: 'CHECK_MEDIA_RESPONSE',
      payload: { status: 'unavailable' },
    };
    const series: DetectedMedia = { type: 'series', title: 'Stranger Things', tmdbId: '66732' };

    injectStatusIndicator(response, series);
    document.getElementById('media-connector-indicator')?.click();

    expect(openMediaDialog).toHaveBeenCalledWith({
      title: 'Stranger Things',
      year: undefined,
      imdbId: undefined,
      tmdbId: '66732',
      mediaType: 'series',
    });
  });

  it('injects unconfigured indicator', () => {
    const response: CheckMediaResponse = {
      type: 'CHECK_MEDIA_RESPONSE',
      payload: {
        status: 'unconfigured',
      },
    };

    injectStatusIndicator(response, movie);

    const indicator = document.getElementById('media-connector-indicator');
    expect(indicator?.textContent).to.contain('Configure Extension');
  });

  it('injects partial indicator', () => {
    const response: CheckMediaResponse = {
      type: 'CHECK_MEDIA_RESPONSE',
      payload: {
        status: 'partial',
        itemUrl: 'https://emby.test/123',
        details: 'Only Season 1',
      },
    };

    injectStatusIndicator(response, movie);

    const indicator = document.getElementById('media-connector-indicator');
    expect(indicator?.textContent).to.contain('Only Season 1');

    // Every state opens the dialog, which has the server link
    vi.spyOn(window, 'open').mockImplementation(() => null);
    indicator?.click();
    expect(openMediaDialog).toHaveBeenCalledWith(expect.objectContaining({ title: 'Glass Onion' }));
    expect(window.open).not.toHaveBeenCalled();
  });

  it('removes itself when close is clicked', async () => {
    const response: CheckMediaResponse = {
      type: 'CHECK_MEDIA_RESPONSE',
      payload: { status: 'available', itemUrl: 'url' },
    };

    injectStatusIndicator(response, movie);
    const indicator = document.getElementById('media-connector-indicator');
    const closeBtn = Array.from(indicator!.querySelectorAll('span')).find(
      (s) => s.textContent === '×',
    );

    expect(closeBtn).to.exist;
    closeBtn!.click();

    // It has a 200ms timeout before removal
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(document.getElementById('media-connector-indicator')).to.not.exist;
  });
});
