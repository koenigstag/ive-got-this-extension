import {
  COMBINED_SVG,
  sendMessage,
  createInfoRow,
  createNotFoundRows,
  buildResultRow,
  injectSkeletonKeyframes,
} from '../common-ui.js';
import { t } from '../../i18n/index.js';
import { readTmdbTitle } from './tmdb-page.js';
import type { SearchJellyseerrResponse, GetConfigResponse } from '../../types/messages.js';

export const TMDB_CARD_ID = 'media-connector-tmdb-card';
export const TMDB_SKELETON_ID = 'media-connector-tmdb-skeleton';

/**
 * TMDB (themoviedb.org) handler.
 *
 * A title page names its TMDB id in the URL, the id Jellyseerr works with, so
 * the card asks Jellyseerr for exactly that title rather than searching by
 * name. TMDB pages are plain page loads, so the card is built once.
 */
export const initTmdb = async (): Promise<void> => {
  const page = readTmdbTitle(document, window.location.href);
  // TMDB sometimes answers with a "Checking your browser..." page first, at
  // the same URL; the real page then loads anew.
  if (!page?.title || !document.querySelector('.column_wrapper')) return;
  console.log('[Media Connector] TMDB title page:', page);

  const configRes = await sendMessage<GetConfigResponse>({ type: 'GET_CONFIG' });
  const serverLabel = configRes?.payload.serverType === 'jellyfin' ? 'Jellyfin' : 'Emby';
  showTmdbSkeleton(serverLabel);

  const response = await sendMessage<SearchJellyseerrResponse>({
    type: 'SEARCH_JELLYSEERR',
    payload: {
      query: page.title,
      mediaType: page.mediaType,
      year: page.year,
      tmdbId: page.tmdbId,
    },
  });
  removeTmdbSkeleton();
  if (!response) return;

  injectTmdbCard(response, page.title, page.mediaType);
};

const removeTmdbSkeleton = (): void => {
  document.getElementById(TMDB_SKELETON_ID)?.remove();
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

/**
 * Wrap the card in TMDB's own panel section, so it takes the width and the
 * spacing of the panels under it (the column is a wrapping flex row). The
 * wrapper carries the id, so removing it removes everything.
 */
const wrapForTmdb = (id: string, card: HTMLElement): HTMLElement => {
  const section = document.createElement('section');
  section.id = id;
  section.className = 'panel';
  section.appendChild(card);
  return section;
};

const showTmdbSkeleton = (serverLabel: string): void => {
  if (document.getElementById(TMDB_SKELETON_ID)) return;
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
  placeOnTmdbPage(wrapForTmdb(TMDB_SKELETON_ID, card));
};

export const injectTmdbCard = (
  response: SearchJellyseerrResponse,
  queryTitle: string,
  mediaType?: 'movie' | 'tv',
): void => {
  if (document.getElementById(TMDB_CARD_ID)) return;

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

  placeOnTmdbPage(wrapForTmdb(TMDB_CARD_ID, card));
};

/**
 * Put the card at the top of the page's main (white) column, under the
 * header with the poster and the overview, before the cast.
 */
const placeOnTmdbPage = (element: HTMLElement): void => {
  const column =
    document.querySelector<HTMLElement>('.column_wrapper .white_column') ??
    document.querySelector<HTMLElement>('.column_wrapper');
  (column ?? document.querySelector<HTMLElement>('main') ?? document.body).prepend(element);
};
