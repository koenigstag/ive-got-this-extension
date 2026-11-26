import {
  COMBINED_SVG,
  sendMessage,
  createInfoRow,
  buildResultRow,
  injectSkeletonKeyframes,
} from '../common-ui.js';
import { t } from '../../i18n/index.js';
import { tryDetectMedia } from '../index.js';
import { getIviTitleSlug } from '../content-script-helpers.js';
import type { DetectedMedia } from '../../types/index.js';
import type { SearchJellyseerrResponse, GetConfigResponse } from '../../types/messages.js';

export const IVI_CARD_ID = 'media-connector-ivi-card';
export const IVI_SKELETON_ID = 'media-connector-ivi-skeleton';

/** How often the page is checked while the app keeps changing the DOM. */
const CHECK_INTERVAL_MS = 400;

/**
 * After in-app navigation ivi changes the URL first and the page a moment
 * later. A page that still looks like the previous one is waited out for this
 * long; after that it is taken as real (two titles can share a name).
 */
const STALE_PAGE_WAIT_MS = 2500;

/** What the page shows right now: og:title and the heading, which ivi updates together. */
const pageSignature = (): string =>
  `${document.querySelector('meta[property="og:title"]')?.getAttribute('content') ?? ''}|${
    document.querySelector('h1')?.textContent ?? ''
  }`;

const mediaTitle = (media: DetectedMedia): string =>
  media.type === 'season' || media.type === 'episode' ? media.seriesTitle : media.title;

/**
 * ivi.ru / ivi.tv handler.
 *
 * ivi is a single-page app, so the content script stays on every ivi page and
 * watches for in-app navigation: on a title page (`/watch/<slug>`, its episode
 * pages included) it searches Jellyseerr by the page's title and year and
 * shows the result card under the hero; it removes the card when the user
 * moves to another title or leaves the title pages.
 */
export const initIvi = (): void => {
  let currentSlug: string | undefined;
  // The page as the previous check saw it, and the page left behind when the
  // URL moved to another title.
  let lastSignature: string | undefined;
  let staleSignature: string | undefined;
  let slugChangedAt = 0;
  let searching = false;
  let pendingCheck: ReturnType<typeof setTimeout> | undefined;
  let staleTimer: ReturnType<typeof setTimeout> | undefined;
  let lastCheckAt = 0;
  // The last search result, so a card the app's re-render removed comes back
  // without a second request.
  let shown: { slug: string; title: string; response: SearchJellyseerrResponse } | undefined;
  // One search per title: a failed one is not retried on every DOM change.
  let searchedSlug: string | undefined;

  const check = async (): Promise<void> => {
    const slug = getIviTitleSlug(window.location.href);
    const signature = pageSignature();
    const previousSignature = lastSignature;
    lastSignature = signature;

    if (slug !== currentSlug) {
      staleSignature = previousSignature;
      slugChangedAt = Date.now();
      currentSlug = slug;
      shown = undefined;
      searchedSlug = undefined;
      removeIviCard();
    }

    if (!slug || searching || (searchedSlug === slug && !shown)) return;

    if (shown?.slug === slug) {
      if (!document.getElementById(IVI_CARD_ID)) injectIviCard(shown.response, shown.title);
      return;
    }

    if (staleSignature !== undefined && signature === staleSignature) {
      const waited = Date.now() - slugChangedAt;
      if (waited < STALE_PAGE_WAIT_MS) {
        // DOM changes bring the next check sooner; this one is the last word.
        staleTimer ??= setTimeout(() => {
          staleTimer = undefined;
          scheduleCheck();
        }, STALE_PAGE_WAIT_MS - waited);
        return;
      }
    }
    staleSignature = undefined;

    const media = tryDetectMedia();
    if (!media) return;
    const title = mediaTitle(media);

    searching = true;
    searchedSlug = slug;
    try {
      const configRes = await sendMessage<GetConfigResponse>({ type: 'GET_CONFIG' });
      const serverLabel = configRes?.payload.serverType === 'jellyfin' ? 'Jellyfin' : 'Emby';
      if (getIviTitleSlug(window.location.href) !== slug) return;

      showIviSkeleton(serverLabel);
      const response = await sendMessage<SearchJellyseerrResponse>({
        type: 'SEARCH_JELLYSEERR',
        payload: {
          query: title,
          mediaType: media.type === 'movie' ? 'movie' : 'tv',
          year: media.year,
        },
      });
      removeIviSkeleton();

      // The user may have moved on while the search ran.
      if (!response || getIviTitleSlug(window.location.href) !== slug) return;

      shown = { slug, title, response };
      injectIviCard(response, title);
    } finally {
      searching = false;
      removeIviSkeleton();
    }
  };

  const runCheck = (): void => {
    pendingCheck = undefined;
    lastCheckAt = Date.now();
    void check();
  };

  // Throttle rather than debounce: the trailer and carousels mutate the DOM
  // without pause, so a debounce would never fire.
  const scheduleCheck = (): void => {
    if (pendingCheck) return;
    const wait = Math.max(0, CHECK_INTERVAL_MS - (Date.now() - lastCheckAt));
    pendingCheck = setTimeout(runCheck, wait);
  };

  new MutationObserver(() => scheduleCheck()).observe(document.body, {
    childList: true,
    subtree: true,
  });
  window.addEventListener('popstate', () => scheduleCheck());

  runCheck();
};

const removeIviCard = (): void => {
  document.getElementById(IVI_CARD_ID)?.remove();
  removeIviSkeleton();
};

const removeIviSkeleton = (): void => {
  document.getElementById(IVI_SKELETON_ID)?.remove();
};

const CARD_STYLE: Partial<CSSStyleDeclaration> = {
  fontFamily: "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  background: 'linear-gradient(145deg, #1a1130 0%, #120d20 100%)',
  border: '1px solid rgba(123, 47, 190, 0.35)',
  borderRadius: '16px',
  padding: '20px',
  color: '#e8e0f0',
  boxShadow: '0 4px 24px rgba(0,0,0,0.45)',
  fontSize: '14px',
  lineHeight: '1.5',
  maxWidth: '720px',
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

/**
 * Wrap the card in ivi's own page-section classes so it lines up with the
 * page's content column at every width. The wrapper carries the id, so
 * removing it removes everything.
 */
const wrapForIvi = (id: string, card: HTMLElement): HTMLElement => {
  const section = document.createElement('section');
  section.id = id;
  section.className = 'pageSection';
  section.style.paddingBlock = '24px 8px';
  section.innerHTML =
    '<div class="pageSection__container"><div class="pageSection__container-inner"></div></div>';
  section.querySelector('.pageSection__container-inner')!.appendChild(card);
  return section;
};

const showIviSkeleton = (serverLabel: string): void => {
  if (document.getElementById(IVI_SKELETON_ID)) return;
  injectSkeletonKeyframes();

  const shimmerStyle =
    'background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 75%); background-size: 800px 100%; animation: mcShimmer 1.6s ease-in-out infinite;';

  const card = document.createElement('div');
  Object.assign(card.style, CARD_STYLE);
  card.innerHTML = `
    ${headerHtml(serverLabel)}
    <div style="display:flex;gap:12px;align-items:flex-start;">
      <div style="width:60px;height:90px;border-radius:8px;flex-shrink:0;${shimmerStyle}"></div>
      <div style="flex:1;display:flex;flex-direction:column;gap:8px;padding-top:4px;">
        <div style="width:75%;height:14px;border-radius:4px;${shimmerStyle}"></div>
        <div style="width:40%;height:11px;border-radius:4px;${shimmerStyle}"></div>
        <div style="width:50%;height:26px;border-radius:6px;margin-top:4px;${shimmerStyle}"></div>
      </div>
    </div>
  `;

  appendToIviPage(wrapForIvi(IVI_SKELETON_ID, card));
};

export const injectIviCard = (response: SearchJellyseerrResponse, queryTitle: string): void => {
  if (document.getElementById(IVI_CARD_ID)) return;

  const { results, jellyseerrEnabled, serverType, error } = response.payload;
  const serverLabel = serverType === 'jellyfin' ? 'Jellyfin' : 'Emby';

  const card = document.createElement('div');
  Object.assign(card.style, CARD_STYLE);
  card.innerHTML = headerHtml(serverLabel);

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

  appendToIviPage(wrapForIvi(IVI_CARD_ID, card));
};

/**
 * Put the card right under the hero (title, trailer, watch button), before
 * the episode list and the rest of the page.
 */
const appendToIviPage = (element: HTMLElement): void => {
  const underside = document.querySelector<HTMLElement>('.underside');
  if (underside?.parentElement) {
    underside.before(element);
    return;
  }

  const hero = document.querySelector<HTMLElement>('.oversideTrailer');
  if (hero?.parentElement) {
    hero.after(element);
    return;
  }

  (document.querySelector<HTMLElement>('main') ?? document.body).prepend(element);
};
