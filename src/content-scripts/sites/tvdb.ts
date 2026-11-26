import {
  COMBINED_SVG,
  sendMessage,
  createInfoRow,
  buildResultRow,
  injectSkeletonKeyframes,
} from '../common-ui.js';
import { t } from '../../i18n/index.js';
import { readTvdbTitle } from './tvdb-page.js';
import type { SearchJellyseerrResponse, GetConfigResponse } from '../../types/messages.js';

export const TVDB_CARD_ID = 'media-connector-tvdb-card';
export const TVDB_SKELETON_ID = 'media-connector-tvdb-skeleton';

/**
 * TheTVDB (thetvdb.com) handler.
 *
 * Series and movie pages link the title on TMDB, the id Jellyseerr works
 * with, so the card asks Jellyseerr for exactly that title; a page without
 * the link is searched by its name and year. TVDB pages are plain page
 * loads, so the card is built once.
 */
export const initTvdb = async (): Promise<void> => {
  const page = readTvdbTitle(document, window.location.href);
  if (!page?.title || !findTitleBlock()) return;
  console.log('[Media Connector] TVDB title page:', page);

  const configRes = await sendMessage<GetConfigResponse>({ type: 'GET_CONFIG' });
  const serverLabel = configRes?.payload.serverType === 'jellyfin' ? 'Jellyfin' : 'Emby';
  showTvdbSkeleton(serverLabel);

  const response = await sendMessage<SearchJellyseerrResponse>({
    type: 'SEARCH_JELLYSEERR',
    payload: {
      query: page.title,
      mediaType: page.mediaType,
      year: page.year,
      ...(page.tmdbId ? { tmdbId: page.tmdbId } : {}),
    },
  });
  removeTvdbSkeleton();
  if (!response) return;

  injectTvdbCard(response, page.title);
};

const removeTvdbSkeleton = (): void => {
  document.getElementById(TVDB_SKELETON_ID)?.remove();
};

const CARD_STYLE: Partial<CSSStyleDeclaration> = {
  fontFamily: "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  background: 'linear-gradient(145deg, #1a1130 0%, #120d20 100%)',
  border: '1px solid rgba(123, 47, 190, 0.35)',
  borderRadius: '16px',
  padding: '20px',
  color: '#e8e0f0',
  boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
  fontSize: '14px',
  lineHeight: '1.5',
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

const newCard = (serverLabel: string): HTMLDivElement => {
  const card = document.createElement('div');
  Object.assign(card.style, CARD_STYLE);
  card.innerHTML = headerHtml(serverLabel);
  return card;
};

/** The wrapper carries the id, so removing it removes everything. */
const wrapForTvdb = (id: string, card: HTMLElement): HTMLElement => {
  const wrapper = document.createElement('div');
  wrapper.id = id;
  wrapper.style.margin = '20px 0 10px';
  wrapper.appendChild(card);
  return wrapper;
};

const showTvdbSkeleton = (serverLabel: string): void => {
  if (document.getElementById(TVDB_SKELETON_ID)) return;
  injectSkeletonKeyframes();

  const shimmerStyle =
    'background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 75%); background-size: 800px 100%; animation: mcShimmer 1.6s ease-in-out infinite;';

  const card = newCard(serverLabel);
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
  placeOnTvdbPage(wrapForTvdb(TVDB_SKELETON_ID, card));
};

export const injectTvdbCard = (response: SearchJellyseerrResponse, queryTitle: string): void => {
  if (document.getElementById(TVDB_CARD_ID)) return;

  const { results, jellyseerrEnabled, serverType, error } = response.payload;
  const serverLabel = serverType === 'jellyfin' ? 'Jellyfin' : 'Emby';
  const card = newCard(serverLabel);

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
      const row = buildResultRow(item, serverLabel);
      if (idx > 0) {
        row.style.borderTop = '1px solid rgba(255,255,255,0.06)';
        row.style.paddingTop = '12px';
      }
      card.appendChild(row);
    });
  }

  placeOnTvdbPage(wrapForTvdb(TVDB_CARD_ID, card));
};

/** The block with the poster, the title and the translations at the top of the page. */
const findTitleBlock = (): HTMLElement | undefined =>
  document.querySelector<HTMLElement>('#series_title')?.closest<HTMLElement>('.row') ?? undefined;

/**
 * Put the card right under the block with the poster and the title, above
 * the tabs with the basic info, seasons and lists.
 */
const placeOnTvdbPage = (element: HTMLElement): void => {
  const titleBlock = findTitleBlock();
  if (titleBlock) titleBlock.after(element);
  else (document.querySelector<HTMLElement>('.container') ?? document.body).prepend(element);
};
