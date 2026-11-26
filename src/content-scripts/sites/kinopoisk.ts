import {
  COMBINED_SVG,
  sendMessage,
  createInfoRow,
  createNotFoundRows,
  buildResultRow,
  injectSkeletonKeyframes,
} from '../common-ui.js';
import { t } from '../../i18n/index.js';
import { getKinopoiskTitleId, kinopoiskQueries, readKinopoiskTitle } from './kinopoisk-page.js';
import type { SearchJellyseerrResponse, GetConfigResponse } from '../../types/messages.js';

export const KINOPOISK_CARD_ID = 'media-connector-kinopoisk-card';
export const KINOPOISK_SKELETON_ID = 'media-connector-kinopoisk-skeleton';

/** How often the page is checked while it keeps changing the DOM. */
const CHECK_INTERVAL_MS = 400;

/**
 * Kinopoisk (kinopoisk.ru) handler.
 *
 * On a film or series page (`/film/<id>/`, `/series/<id>/`) it searches
 * Jellyseerr by the original title and then the Russian one (the pages carry
 * no IMDb or TMDB id), with the year and the type, and shows the result card
 * under the title, the description and the "Буду смотреть" button.
 *
 * Kinopoisk is a single-page app: going to another title changes the URL, and
 * a moment later the page and its JSON-LD. The script runs on the whole site,
 * waits until the JSON-LD names the page in the URL, searches once per title,
 * and puts a card the app's re-render removed back from memory.
 */
export const initKinopoisk = (): (() => void) => {
  const shown = new Map<
    string,
    { title: string; mediaType: 'movie' | 'tv'; response: SearchJellyseerrResponse }
  >();
  let activeId: string | undefined;
  let searchingId: string | undefined;
  let pendingCheck: ReturnType<typeof setTimeout> | undefined;
  let lastCheckAt = 0;

  const check = async (): Promise<void> => {
    const id = getKinopoiskTitleId(window.location.href)?.id;
    if (id !== activeId) {
      activeId = id;
      removeKinopoiskCard();
    }
    if (!id) return;
    if (document.getElementById(KINOPOISK_CARD_ID)?.dataset.kinopoiskId === id) return;

    const known = shown.get(id);
    if (known) {
      injectKinopoiskCard(known.response, known.title, id, known.mediaType);
      return;
    }
    if (searchingId === id) return;

    const page = readKinopoiskTitle(document, window.location.href);
    if (!page || !findTitleBlock()) return;
    console.log('[Media Connector] Kinopoisk title:', page);

    searchingId = id;
    try {
      const configRes = await sendMessage<GetConfigResponse>({ type: 'GET_CONFIG' });
      if (activeId !== id) return;
      const serverLabel = configRes?.payload.serverType === 'jellyfin' ? 'Jellyfin' : 'Emby';
      showKinopoiskSkeleton(serverLabel);

      let response: SearchJellyseerrResponse | undefined;
      for (const query of kinopoiskQueries(page)) {
        response = await sendMessage<SearchJellyseerrResponse>({
          type: 'SEARCH_JELLYSEERR',
          payload: { query, mediaType: page.mediaType, year: page.year },
        });
        // The user may have moved on while the search ran.
        if (activeId !== id) return;
        const payload = response?.payload;
        // Only an empty result is worth another title.
        if (!payload || !payload.jellyseerrEnabled || payload.error || payload.results.length > 0) {
          break;
        }
      }

      removeKinopoiskSkeleton();
      if (!response) return;
      shown.set(id, { title: page.title, mediaType: page.mediaType, response });
      injectKinopoiskCard(response, page.title, id, page.mediaType);
    } finally {
      if (searchingId === id) searchingId = undefined;
      if (activeId === id) removeKinopoiskSkeleton();
    }
  };

  const runCheck = (): void => {
    pendingCheck = undefined;
    lastCheckAt = Date.now();
    void check();
  };

  // Throttle rather than debounce: the page keeps mutating (banners, lazy blocks).
  const scheduleCheck = (): void => {
    if (pendingCheck) return;
    const wait = Math.max(0, CHECK_INTERVAL_MS - (Date.now() - lastCheckAt));
    pendingCheck = setTimeout(runCheck, wait);
  };

  const observer = new MutationObserver(() => scheduleCheck());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', scheduleCheck);

  runCheck();

  // For tests: stop following the page.
  return () => {
    observer.disconnect();
    window.removeEventListener('popstate', scheduleCheck);
    if (pendingCheck) clearTimeout(pendingCheck);
  };
};

export const removeKinopoiskCard = (): void => {
  document.getElementById(KINOPOISK_CARD_ID)?.remove();
  removeKinopoiskSkeleton();
};

const removeKinopoiskSkeleton = (): void => {
  document.getElementById(KINOPOISK_SKELETON_ID)?.remove();
};

const CARD_STYLE: Partial<CSSStyleDeclaration> = {
  fontFamily: "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  background: 'linear-gradient(145deg, #1a1130 0%, #120d20 100%)',
  border: '1px solid rgba(123, 47, 190, 0.35)',
  borderRadius: '16px',
  padding: '20px',
  margin: '24px 0 8px',
  color: '#e8e0f0',
  boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
  fontSize: '14px',
  lineHeight: '1.5',
  textAlign: 'left',
  boxSizing: 'border-box',
};

const headerHtml = (serverLabel: string): string => {
  const iconHtml = COMBINED_SVG.replace(/width="48" height="48"/, 'width="32" height="32"');
  return `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.08);">
      <div style="width:32px;height:32px;flex-shrink:0;display:flex;align-items:center;justify-content:center;">${iconHtml}</div>
      <div>
        <div style="font-weight:700;font-size:15px;color:#d0bcff;">I've got this!</div>
        <div style="font-size:11px;color:#a89cc0;margin-top:2px;">${t('poweredBy', serverLabel)}</div>
      </div>
    </div>
  `;
};

const newCard = (id: string, serverLabel: string): HTMLDivElement => {
  const card = document.createElement('div');
  card.id = id;
  Object.assign(card.style, CARD_STYLE);
  card.innerHTML = headerHtml(serverLabel);
  return card;
};

const showKinopoiskSkeleton = (serverLabel: string): void => {
  if (document.getElementById(KINOPOISK_SKELETON_ID)) return;
  injectSkeletonKeyframes();

  const shimmerStyle =
    'background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 75%); background-size: 800px 100%; animation: mcShimmer 1.6s ease-in-out infinite;';

  const card = newCard(KINOPOISK_SKELETON_ID, serverLabel);
  card.insertAdjacentHTML(
    'beforeend',
    `
    <div style="display:flex;gap:12px;align-items:flex-start;">
      <div style="width:60px;height:90px;border-radius:8px;flex-shrink:0;${shimmerStyle}"></div>
      <div style="flex:1;display:flex;flex-direction:column;gap:8px;padding-top:4px;">
        <div style="width:75%;height:14px;border-radius:4px;${shimmerStyle}"></div>
        <div style="width:40%;height:11px;border-radius:4px;${shimmerStyle}"></div>
        <div style="width:50%;height:26px;border-radius:6px;margin-top:4px;${shimmerStyle}"></div>
      </div>
    </div>
  `,
  );
  placeOnKinopoiskPage(card);
};

export const injectKinopoiskCard = (
  response: SearchJellyseerrResponse,
  queryTitle: string,
  kinopoiskId: string,
  mediaType?: 'movie' | 'tv',
): void => {
  if (document.getElementById(KINOPOISK_CARD_ID)) return;

  const { results, jellyseerrEnabled, serverType, error } = response.payload;
  const serverLabel = serverType === 'jellyfin' ? 'Jellyfin' : 'Emby';
  const card = newCard(KINOPOISK_CARD_ID, serverLabel);
  card.dataset.kinopoiskId = kinopoiskId;

  if (!jellyseerrEnabled) {
    card.appendChild(
      createInfoRow('⚙️', t('jellyseerrNotConfigured'), t('jellyseerrNotConfiguredPopup')),
    );
  } else if (error) {
    card.appendChild(createInfoRow('⚠️', t('connectionError'), error));
  } else if (results.length === 0) {
    card.appendChild(createNotFoundRows(response, queryTitle, mediaType));
  } else {
    results.forEach((item, idx) => {
      const row = buildResultRow(item, serverLabel);
      if (idx > 0) {
        row.style.borderTop = '1px solid rgba(255,255,255,0.06)';
        row.style.paddingTop = '12px';
      }
      card.appendChild(row);
    });
  }

  placeOnKinopoiskPage(card);
};

/**
 * The block with the title, the original title, the short description and
 * the "Буду смотреть" button: the h1's grandparent. Its class names are hashed
 * CSS-module names, so the block is found from the h1 rather than by class.
 */
const findTitleBlock = (): HTMLElement | undefined =>
  document.querySelector<HTMLElement>('main h1, h1')?.parentElement?.parentElement ?? undefined;

/** Put the card at the end of the title block, above "О фильме" / "О сериале". */
const placeOnKinopoiskPage = (element: HTMLElement): void => {
  const block = findTitleBlock();
  if (block) block.appendChild(element);
  else (document.querySelector<HTMLElement>('main') ?? document.body).prepend(element);
};
