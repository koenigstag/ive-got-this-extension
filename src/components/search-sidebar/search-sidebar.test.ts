import { html, fixture, expect } from '@open-wc/testing';
import { SearchSidebar } from './search-sidebar.js';
import { mockSearchResponses } from '../../sandbox/mock-data.js';
import type { SearchJellyseerrResponse } from '../../types/messages.js';
import { setLanguage } from '../../i18n/index.js';

// Ensure registration
import './search-sidebar.js';

describe('search-sidebar', () => {
  it('renders nothing when no response is provided', async () => {
    const el = await fixture<SearchSidebar>(html`<search-sidebar></search-sidebar>`);
    expect(el.shadowRoot?.childElementCount).to.equal(0);
  });

  it('renders multiple results correctly', async () => {
    const el = await fixture<SearchSidebar>(
      html`<search-sidebar .response="${mockSearchResponses.multiple}"></search-sidebar>`,
    );

    const rows = el.shadowRoot?.querySelectorAll('.result-row');
    expect(rows?.length).to.equal(3);

    const firstTitle = rows?.[0].querySelector('.title');
    expect(firstTitle?.textContent).to.contain('The Matrix');

    const availableBtn = rows?.[0].querySelector('button');
    expect(availableBtn?.textContent?.trim()).to.contain('Play on Emby');
  });

  it('renders no results message', async () => {
    const el = await fixture<SearchSidebar>(
      html`<search-sidebar
        .response="${mockSearchResponses.noResults}"
        queryTitle="Missing Item"
      ></search-sidebar>`,
    );

    const infoRow = el.shadowRoot?.querySelector('.info-row');
    expect(infoRow).to.exist;
    expect(infoRow?.textContent).to.contain('No results');
    expect(infoRow?.textContent).to.contain('Missing Item');
  });

  it('renders unconfigured message', async () => {
    const el = await fixture<SearchSidebar>(
      html`<search-sidebar .response="${mockSearchResponses.unconfigured}"></search-sidebar>`,
    );

    const infoRow = el.shadowRoot?.querySelector('.info-row');
    expect(infoRow).to.exist;
    expect(infoRow?.textContent).to.contain('Jellyseerr not configured');
  });

  it('renders error message', async () => {
    const errorResponse: SearchJellyseerrResponse = {
      type: 'SEARCH_JELLYSEERR_RESPONSE',
      payload: {
        results: [],
        jellyseerrEnabled: true,
        serverType: 'emby',
        error: 'API Timeout',
      },
    };

    const el = await fixture<SearchSidebar>(
      html`<search-sidebar .response="${errorResponse}"></search-sidebar>`,
    );

    const infoRow = el.shadowRoot?.querySelector('.info-row');
    expect(infoRow?.textContent).to.contain('Connection error');
    expect(infoRow?.textContent).to.contain('API Timeout');
  });

  it('renders pending status button', async () => {
    const pendingResponse: SearchJellyseerrResponse = {
      type: 'SEARCH_JELLYSEERR_RESPONSE',
      payload: {
        results: [{ id: 123, title: 'Pending Movie', status: 'pending', mediaType: 'movie' }],
        jellyseerrEnabled: true,
        serverType: 'emby',
        jellyseerrUrl: 'https://jsr.test',
      },
    };

    const el = await fixture<SearchSidebar>(
      html`<search-sidebar .response="${pendingResponse}"></search-sidebar>`,
    );

    const pendingBtn = el.shadowRoot?.querySelector('.result-row button');
    expect(pendingBtn?.textContent?.includes('Pending')).to.be.true;
  });

  it('renders processing status button', async () => {
    const processingResponse: SearchJellyseerrResponse = {
      type: 'SEARCH_JELLYSEERR_RESPONSE',
      payload: {
        results: [{ id: 123, title: 'Processing Movie', status: 'processing', mediaType: 'movie' }],
        jellyseerrEnabled: true,
        serverType: 'emby',
        jellyseerrUrl: 'https://jsr.test',
      },
    };

    const el = await fixture<SearchSidebar>(
      html`<search-sidebar .response="${processingResponse}"></search-sidebar>`,
    );

    const pendingBtn = el.shadowRoot?.querySelector('.result-row button');
    expect(pendingBtn?.textContent?.includes('Pending')).to.be.true;
  });

  it('renders Manage in Jellyseerr button for available items', async () => {
    const el = await fixture<SearchSidebar>(
      html`<search-sidebar .response="${mockSearchResponses.multiple}"></search-sidebar>`,
    );

    const rows = el.shadowRoot?.querySelectorAll('.result-row');
    const manageBtn = Array.from(rows?.[0].querySelectorAll('button') || []).find((b) =>
      b.textContent?.includes('Manage'),
    );
    expect(manageBtn).to.exist;
  });

  it('handles request button click', async () => {
    const el = await fixture<SearchSidebar>(
      html`<search-sidebar .response="${mockSearchResponses.multiple}"></search-sidebar>`,
    );

    const rows = el.shadowRoot?.querySelectorAll('.result-row');
    const reqBtn = rows?.[2].querySelector('button') as HTMLButtonElement;
    expect(reqBtn.textContent).to.contain('Request');
  });

  describe('buttons that talk to the service worker', () => {
    // In the extension the sidebar runs inside the content script, which has to ask the
    // service worker to open tabs. Record what the buttons send.
    type ChromeMock = { runtime: { id: string; lastError: null; sendMessage: unknown } };
    let sent: unknown[];
    let savedChrome: unknown;

    beforeEach(() => {
      sent = [];
      savedChrome = (window as unknown as { chrome?: unknown }).chrome;
      (window as unknown as { chrome: ChromeMock }).chrome = {
        runtime: {
          id: 'test-extension',
          lastError: null,
          sendMessage: (message: unknown, callback?: (r: unknown) => void) => {
            sent.push(message);
            callback?.(undefined);
          },
        },
      };
    });

    afterEach(() => {
      (window as unknown as { chrome?: unknown }).chrome = savedChrome;
    });

    /** The dialog the Jellyseerr buttons open (see media-dialog.ts), removed after each test. */
    const dialogHost = () => document.getElementById('media-connector-dialog-host');
    afterEach(() => dialogHost()?.remove());

    it('opens the media dialog from a pending request', async () => {
      const pendingResponse: SearchJellyseerrResponse = {
        type: 'SEARCH_JELLYSEERR_RESPONSE',
        payload: {
          results: [
            { id: 123, title: 'Pending Movie', year: 2001, status: 'pending', mediaType: 'movie' },
          ],
          jellyseerrEnabled: true,
          serverType: 'emby',
          jellyseerrUrl: 'https://jsr.test',
        },
      };
      const el = await fixture<SearchSidebar>(
        html`<search-sidebar .response="${pendingResponse}"></search-sidebar>`,
      );

      (el.shadowRoot?.querySelector('.result-row button') as HTMLButtonElement).click();

      expect(dialogHost()?.shadowRoot?.querySelector('dialog')?.open).to.equal(true);
      expect(sent).to.deep.equal([
        {
          type: 'GET_MEDIA_DETAILS',
          payload: { title: 'Pending Movie', year: 2001, tmdbId: '123', mediaType: 'movie' },
        },
      ]);
    });

    it('opens the media dialog from Manage in Jellyseerr on an available series', async () => {
      const el = await fixture<SearchSidebar>(
        html`<search-sidebar .response="${mockSearchResponses.multiple}"></search-sidebar>`,
      );
      const tvRow = el.shadowRoot?.querySelectorAll('.result-row')[1];
      const manageBtn = Array.from(tvRow?.querySelectorAll('button') ?? []).find((b) =>
        b.textContent?.includes('Manage'),
      ) as HTMLButtonElement;

      manageBtn.click();

      const tv = mockSearchResponses.multiple.payload.results[1];
      expect(sent).to.deep.equal([
        {
          type: 'GET_MEDIA_DETAILS',
          payload: { title: tv.title, year: tv.year, tmdbId: String(tv.id), mediaType: 'series' },
        },
      ]);
    });

    it('opens the media dialog from Request instead of requesting at once', async () => {
      const response: SearchJellyseerrResponse = {
        type: 'SEARCH_JELLYSEERR_RESPONSE',
        payload: {
          results: [{ id: 7, title: 'New Show', status: 'not_requested', mediaType: 'tv' }],
          jellyseerrEnabled: true,
          serverType: 'jellyfin',
          jellyseerrUrl: 'https://jsr.test',
        },
      };
      const el = await fixture<SearchSidebar>(
        html`<search-sidebar .response="${response}"></search-sidebar>`,
      );

      (el.shadowRoot?.querySelector('.result-row button') as HTMLButtonElement).click();

      expect(sent.map((m) => (m as { type: string }).type)).to.deep.equal(['GET_MEDIA_DETAILS']);
      expect(dialogHost()).to.exist;
    });

    it('opens the extension settings from the header', async () => {
      const el = await fixture<SearchSidebar>(
        html`<search-sidebar .response="${mockSearchResponses.multiple}"></search-sidebar>`,
      );

      const btn = el.shadowRoot?.querySelector('.header .settings-btn') as HTMLButtonElement;
      expect(btn.title).to.equal('Extension settings');
      btn.click();
      expect(sent).to.deep.equal([{ type: 'OPEN_SETTINGS' }]);
    });

    it('offers to open the settings when Jellyseerr is not configured', async () => {
      const el = await fixture<SearchSidebar>(
        html`<search-sidebar .response="${mockSearchResponses.unconfigured}"></search-sidebar>`,
      );

      const btn = el.shadowRoot?.querySelector('.info-row .open-settings') as HTMLButtonElement;
      expect(btn.textContent?.trim()).to.equal('Open settings');
      btn.click();
      expect(sent).to.deep.equal([{ type: 'OPEN_SETTINGS' }]);
    });
  });
});

describe('search-sidebar in Russian', () => {
  afterEach(() => {
    setLanguage('en');
  });

  it('renders the header, badges and buttons in Russian', async () => {
    setLanguage('ru');
    const el = await fixture<SearchSidebar>(
      html`<search-sidebar .response="${mockSearchResponses.multiple}"></search-sidebar>`,
    );

    expect(el.shadowRoot?.querySelector('.header-subtitle')?.textContent).to.equal(
      'По данным Jellyseerr · Emby',
    );
    const rows = el.shadowRoot?.querySelectorAll('.result-row');
    expect(rows?.[0].querySelector('.type-label')?.textContent).to.equal('Фильм');
    expect(rows?.[0].textContent).to.contain('✓ В библиотеке');
    expect(rows?.[0].querySelector('button')?.textContent).to.contain('▶ Смотреть в Emby');
    expect(rows?.[2].querySelector('button')?.textContent).to.contain('＋ Запросить');
  });
});
