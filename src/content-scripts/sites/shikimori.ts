import {
  COMBINED_SVG,
  sendMessage,
  createInfoRow,
  buildResultRow,
  injectSkeletonKeyframes,
} from '../common-ui.js';
import { t } from '../../i18n/index.js';
import { buildShikimoriSearch, getShikimoriAnimeId, readShikimoriAnime } from './shikimori-page.js';
import type { SearchJellyseerrResponse, GetConfigResponse } from '../../types/messages.js';

export const SHIKIMORI_CARD_ID = 'media-connector-shikimori-card';
export const SHIKIMORI_SKELETON_ID = 'media-connector-shikimori-skeleton';

/**
 * Shikimori handler (shikimori.io and its older domains).
 *
 * On an anime page it searches Jellyseerr by the English, romaji and Russian
 * titles in turn, until one finds something, and shows the result card above
 * the description.
 *
 * Shikimori navigates with Turbolinks: the page's <body> is swapped without a
 * reload, and `turbolinks:load` follows every visit. The card is taken out on
 * `turbolinks:before-cache`, so Turbolinks' page snapshots don't keep it, and
 * a page visited again gets its card from memory without a new search.
 */
export const initShikimori = (): (() => void) => {
  const shown = new Map<string, { title: string; response: SearchJellyseerrResponse }>();
  let activeId: string | undefined;
  let searching = false;
  // Bumped on every visit, so a search that outlives its page is dropped.
  let visit = 0;

  const run = async (): Promise<void> => {
    const id = getShikimoriAnimeId(window.location.href);
    if (id && id === activeId && (searching || document.getElementById(SHIKIMORI_CARD_ID))) {
      return;
    }
    const thisVisit = ++visit;
    activeId = id;
    removeShikimoriCard();
    if (!id) return;

    const known = shown.get(id);
    if (known) {
      injectShikimoriCard(known.response, known.title);
      return;
    }

    const anime = readShikimoriAnime(document, window.location.href);
    if (!anime) return;
    const search = buildShikimoriSearch(anime);
    if (search.queries.length === 0) return;
    console.log('[Media Connector] Shikimori detected anime:', { anime, search });

    searching = true;
    try {
      const configRes = await sendMessage<GetConfigResponse>({ type: 'GET_CONFIG' });
      if (thisVisit !== visit) return;
      const serverLabel = configRes?.payload.serverType === 'jellyfin' ? 'Jellyfin' : 'Emby';
      showShikimoriSkeleton(serverLabel);

      let response: SearchJellyseerrResponse | undefined;
      for (const query of search.queries) {
        response = await sendMessage<SearchJellyseerrResponse>({
          type: 'SEARCH_JELLYSEERR',
          payload: { query, mediaType: search.mediaType, year: search.year },
        });
        if (thisVisit !== visit) return;
        const payload = response?.payload;
        // Only an empty result is worth another title.
        if (!payload || !payload.jellyseerrEnabled || payload.error || payload.results.length > 0) {
          break;
        }
      }

      removeShikimoriSkeleton();
      if (!response) return;
      shown.set(id, { title: search.displayTitle, response });
      injectShikimoriCard(response, search.displayTitle);
    } finally {
      if (thisVisit === visit) {
        searching = false;
        removeShikimoriSkeleton();
      }
    }
  };

  const onVisit = (): void => void run();
  document.addEventListener('turbolinks:load', onVisit);
  document.addEventListener('turbolinks:before-cache', removeShikimoriCard);
  window.addEventListener('popstate', onVisit);

  void run();

  // For tests: stop following the page.
  return () => {
    document.removeEventListener('turbolinks:load', onVisit);
    document.removeEventListener('turbolinks:before-cache', removeShikimoriCard);
    window.removeEventListener('popstate', onVisit);
  };
};

export const removeShikimoriCard = (): void => {
  document.getElementById(SHIKIMORI_CARD_ID)?.remove();
  removeShikimoriSkeleton();
};

const removeShikimoriSkeleton = (): void => {
  document.getElementById(SHIKIMORI_SKELETON_ID)?.remove();
};

const CARD_STYLE: Partial<CSSStyleDeclaration> = {
  // The description column flows around the floated poster and info blocks;
  // like Shikimori's own section headings, the card starts a block formatting
  // context, so it sits below them instead of underneath.
  display: 'flow-root',
  fontFamily: "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  background: 'linear-gradient(145deg, #1a1130 0%, #120d20 100%)',
  border: '1px solid rgba(123, 47, 190, 0.35)',
  borderRadius: '16px',
  padding: '20px',
  margin: '0 0 24px',
  color: '#e8e0f0',
  boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
  fontSize: '14px',
  lineHeight: '1.5',
  textAlign: 'left',
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

const showShikimoriSkeleton = (serverLabel: string): void => {
  if (document.getElementById(SHIKIMORI_SKELETON_ID)) return;
  injectSkeletonKeyframes();

  const shimmerStyle =
    'background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 75%); background-size: 800px 100%; animation: mcShimmer 1.6s ease-in-out infinite;';

  const card = newCard(SHIKIMORI_SKELETON_ID, serverLabel);
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
  placeOnShikimoriPage(card);
};

export const injectShikimoriCard = (
  response: SearchJellyseerrResponse,
  queryTitle: string,
): void => {
  if (document.getElementById(SHIKIMORI_CARD_ID)) return;

  const { results, jellyseerrEnabled, serverType, jellyseerrUrl, error } = response.payload;
  const serverLabel = serverType === 'jellyfin' ? 'Jellyfin' : 'Emby';
  const card = newCard(SHIKIMORI_CARD_ID, serverLabel);

  if (!jellyseerrEnabled) {
    card.appendChild(
      createInfoRow('⚙️', t('jellyseerrNotConfigured'), t('jellyseerrNotConfiguredPopup')),
    );
  } else if (error) {
    card.appendChild(createInfoRow('⚠️', t('connectionError'), error));
  } else if (results.length === 0) {
    card.appendChild(createInfoRow('🔍', t('noResults'), t('notFoundOnJellyseerr', queryTitle)));
  } else {
    results.forEach((item, idx) => {
      const row = buildResultRow(item, serverLabel, jellyseerrUrl);
      if (idx > 0) {
        row.style.borderTop = '1px solid rgba(255,255,255,0.06)';
        row.style.paddingTop = '12px';
      }
      card.appendChild(row);
    });
  }

  placeOnShikimoriPage(card);
};

/**
 * Put the card at the top of the description column, right under the
 * information and rating blocks; on a page without one, after the title
 * block or at the top of the content.
 */
const placeOnShikimoriPage = (element: HTMLElement): void => {
  const description = document.querySelector<HTMLElement>('.b-db_entry .c-description');
  if (description) {
    description.prepend(element);
    return;
  }

  const entry = document.querySelector<HTMLElement>('.b-db_entry');
  if (entry?.parentElement) {
    entry.after(element);
    return;
  }

  (document.querySelector<HTMLElement>('.l-content') ?? document.body).prepend(element);
};
