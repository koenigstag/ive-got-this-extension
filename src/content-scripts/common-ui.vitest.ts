import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Option } from 'effect';
import * as detectMediaModule from './detect-media.js';
import {
  buildStatusBadge,
  createActionButton,
  createInfoRow,
  injectSkeletonKeyframes,
  buildResultRow,
  tryDetectMedia,
  buildPayload,
  sendMessage,
  openExtensionSettings,
  openInNewTab,
} from './common-ui.js';
import { openMediaDialog } from './media-dialog.js';

// The dialog itself is tested in media-dialog.vitest.ts; here only who opens it, for what.
vi.mock('./media-dialog.js', async () => {
  const actual = await vi.importActual('./media-dialog.js');
  return { ...actual, openMediaDialog: vi.fn() };
});

describe('common-ui', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    // Mock chrome.runtime.sendMessage
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'mock-id',
        sendMessage: vi.fn((_msg: unknown, cb: (response: unknown) => void) =>
          cb({ payload: { success: true } }),
        ),
        lastError: null,
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  describe('tryDetectMedia', () => {
    it('returns media when detected', () => {
      const mockMedia = { type: 'movie' as const, title: 'Test' };
      vi.spyOn(detectMediaModule, 'detectMediaOption').mockReturnValue(Option.some(mockMedia));

      const result = tryDetectMedia();
      expect(result).to.deep.equal(mockMedia);
    });

    it('returns undefined when not detected', () => {
      vi.spyOn(detectMediaModule, 'detectMediaOption').mockReturnValue(Option.none());

      const result = tryDetectMedia();
      expect(result).to.be.undefined;
    });
  });

  describe('buildPayload', () => {
    it('builds a payload from media', () => {
      const mockMedia = { type: 'movie' as const, title: 'Test', year: 2020 };
      const payload = buildPayload(mockMedia);
      expect(payload.title).to.equal('Test');
      expect(payload.year).to.equal(2020);
      expect(payload.mediaType).to.equal('movie');
    });
  });

  describe('sendMessage', () => {
    it('sends message and returns response', async () => {
      const response = await sendMessage({ type: 'TEST' });
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        { type: 'TEST' },
        expect.any(Function),
      );
      expect(response).to.deep.equal({ payload: { success: true } });
    });

    it('returns undefined when chrome is undefined', async () => {
      vi.stubGlobal('chrome', undefined);
      const response = await sendMessage({ type: 'TEST' });
      expect(response).to.be.undefined;
    });

    it('returns undefined on lastError', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockImplementation(
        (_msg: unknown, cb: (response: unknown) => void) => {
          (chrome.runtime as unknown as { lastError: { message: string } }).lastError = {
            message: 'error',
          };
          cb(undefined);
        },
      );
      const response = await sendMessage({ type: 'TEST' });
      expect(response).to.be.undefined;
    });
  });

  describe('openExtensionSettings', () => {
    it('asks the service worker to open the settings', async () => {
      await openExtensionSettings();
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        { type: 'OPEN_SETTINGS' },
        expect.any(Function),
      );
    });
  });

  describe('openInNewTab', () => {
    it('asks the service worker to open the URL', async () => {
      await openInNewTab('https://jsr.test/movie/1');
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        { type: 'OPEN_TAB', payload: { url: 'https://jsr.test/movie/1' } },
        expect.any(Function),
      );
    });
  });

  describe('buildStatusBadge', () => {
    it('returns a green badge for available status', () => {
      const html = buildStatusBadge('available');
      expect(html).to.contain('✓ Available');
      expect(html).to.contain('rgba(76,175,80,0.15)');
    });

    it('returns an orange badge for partial status', () => {
      const html = buildStatusBadge('partial');
      expect(html).to.contain('◐ Partial');
      expect(html).to.contain('rgba(255,152,0,0.15)');
    });

    it('returns a purple badge for not_requested status', () => {
      const html = buildStatusBadge('not_requested');
      expect(html).to.contain('Not in library');
      expect(html).to.contain('rgba(123,47,190,0.15)');
    });

    it('returns a grey badge for pending status', () => {
      const html = buildStatusBadge('pending');
      expect(html).to.contain('⏳ Pending');
    });
  });

  describe('createActionButton', () => {
    it('creates a button with correct text and background', () => {
      const btn = createActionButton('Test Button', '#ff0000', '#cc0000');
      expect(btn.tagName).to.equal('BUTTON');
      expect(btn.textContent).to.equal('Test Button');
      // Use case-insensitive hex or rgb check depending on browser implementation
      expect(btn.style.background.toLowerCase()).to.be.oneOf(['rgb(255, 0, 0)', '#ff0000']);
    });

    it('updates background on hover', () => {
      const btn = createActionButton('Hover', '#ff0000', '#cc0000');
      btn.dispatchEvent(new MouseEvent('mouseenter'));
      expect(btn.style.background.toLowerCase()).to.be.oneOf(['rgb(204, 0, 0)', '#cc0000']);
      btn.dispatchEvent(new MouseEvent('mouseleave'));
      expect(btn.style.background.toLowerCase()).to.be.oneOf(['rgb(255, 0, 0)', '#ff0000']);
    });
  });

  describe('createInfoRow', () => {
    it('creates a row with emoji, title and description', () => {
      const row = createInfoRow('🚀', 'Title', 'Description');
      expect(row.textContent).to.contain('🚀 Title');
      expect(row.textContent).to.contain('Description');
    });
  });

  describe('buildResultRow', () => {
    const mockItem = {
      id: 123,
      title: 'The Matrix',
      year: 1999,
      mediaType: 'movie' as const,
      overview: 'Cool movie',
      status: 'available' as const,
      serverItemUrl: 'https://emby.test/item/123',
    };

    it('gives an available item one button, with the server name, that opens the dialog', () => {
      const row = buildResultRow(mockItem, 'Emby');
      expect(row.textContent).to.contain('The Matrix (1999)');

      const buttons = row.querySelectorAll('button');
      expect(buttons).toHaveLength(1);
      expect(buttons[0].textContent).to.equal('Emby');
      // The server's logo instead of an arrow, decorative (the text names the server).
      expect(buttons[0].querySelector('svg[aria-hidden="true"]')).not.toBeNull();

      vi.spyOn(window, 'open').mockImplementation(() => null);
      buttons[0].click();
      expect(openMediaDialog).toHaveBeenCalledWith({
        title: 'The Matrix',
        year: 1999,
        tmdbId: '123',
        mediaType: 'movie',
      });
      expect(window.open).not.toHaveBeenCalled();
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    });

    it('labels a partly available item with the server', () => {
      const row = buildResultRow({ ...mockItem, status: 'partial' }, 'Jellyfin');
      expect(row.querySelector('button')?.textContent).to.equal('Jellyfin (Partial)');
    });

    it('opens the media dialog from a pending item', () => {
      const row = buildResultRow({ ...mockItem, status: 'pending' }, 'Emby');
      expect(row.textContent).to.contain('⏳ Request Pending');

      row.querySelector('button')?.click();
      expect(openMediaDialog).toHaveBeenCalledWith(expect.objectContaining({ tmdbId: '123' }));
    });

    it('opens the media dialog from Request instead of requesting at once', () => {
      const row = buildResultRow({ ...mockItem, mediaType: 'tv', status: 'not_requested' }, 'Emby');
      const reqBtn = row.querySelector('button');
      expect(reqBtn?.textContent).to.equal('＋ Request…');

      reqBtn?.click();
      // A series goes to the dialog, where the seasons to request are chosen.
      expect(openMediaDialog).toHaveBeenCalledWith({
        title: 'The Matrix',
        year: 1999,
        tmdbId: '123',
        mediaType: 'series',
      });
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    });

    it('renders a poster image if posterUrl is provided', () => {
      const row = buildResultRow({ ...mockItem, posterUrl: 'https://image.test/p.jpg' }, 'Emby');
      const img = row.querySelector('img');
      expect(img).to.exist;
      expect(img?.src).to.equal('https://image.test/p.jpg');
    });
  });

  describe('injectSkeletonKeyframes', () => {
    it('injects style tag into head', () => {
      injectSkeletonKeyframes();
      const style = document.getElementById('media-connector-skeleton-style');
      expect(style).to.exist;
      expect(style?.textContent).to.contain('@keyframes mcShimmer');
    });

    it('does not inject duplicate styles', () => {
      injectSkeletonKeyframes();
      injectSkeletonKeyframes();
      const styles = document.querySelectorAll('#media-connector-skeleton-style');
      expect(styles.length).to.equal(1);
    });
  });
});
