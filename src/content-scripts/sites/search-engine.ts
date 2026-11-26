import { sendMessage, injectSkeletonKeyframes, COMBINED_SVG } from '../common-ui.js';
import { tryDetectMedia, identifySite } from '../index.js';
import type { SearchJellyseerrResponse, GetConfigResponse } from '../../types/messages.js';
import { t } from '../../i18n/index.js';
// Chrome gives content scripts no custom element registry (`customElements` is null in the
// isolated world). The polyfill installs one for this world only, so <search-sidebar> can
// register and render; where a native registry exists it does nothing.
import '@webcomponents/custom-elements';
import '../../components/search-sidebar/search-sidebar.js';

const SIDEBAR_ID = 'media-connector-sidebar';
const SKELETON_ID = 'media-connector-skeleton';

/** The sidebar last put on the page, kept to put it back after Yandex re-renders. */
let lastSidebar: HTMLElement | undefined;

export const initSearchEngineSidebar = async (): Promise<void> => {
  const media = tryDetectMedia();
  if (!media) return;

  const title =
    media.type === 'season' || media.type === 'episode' ? media.seriesTitle : media.title;
  const mediaType = media.type === 'movie' ? ('movie' as const) : ('tv' as const);

  const configRes = await sendMessage<GetConfigResponse>({
    type: 'GET_CONFIG',
  });
  const serverLabel = configRes?.payload.serverType === 'jellyfin' ? 'Jellyfin' : 'Emby';

  showSkeleton(serverLabel);

  const response = await sendMessage<SearchJellyseerrResponse>({
    type: 'SEARCH_JELLYSEERR',
    payload: { query: title, mediaType, year: media.year },
  });

  removeSkeleton();

  if (!response) return;
  // The page moved on to another title while Jellyseerr answered (Yandex swaps results
  // in place): this answer is for a page that is gone.
  if (mediaKey() !== JSON.stringify(media)) return;

  injectSidebar(response, title);
};

/** What the page shows right now, comparable between calls. */
const mediaKey = (): string => JSON.stringify(tryDetectMedia() ?? null);

/** How often the Yandex page is checked for a new title. */
const YANDEX_CHECK_MS = 500;
/** How long a title has to stay on the page before the sidebar follows it. */
const YANDEX_SETTLE_MS = 600;

/**
 * Yandex runs a new search from its own search box without loading a new page: it swaps
 * the results in place and changes the URL with pushState, which a content script cannot
 * hear, and the re-rendered right column no longer holds the sidebar. So on Yandex the
 * sidebar follows the page: when the film or series on it changes and stays for a moment
 * (the swap passes through half-built states), the old sidebar goes and a new search runs;
 * when the column was re-rendered for the same title, the sidebar is put back without one.
 * @returns A function that stops watching (for tests).
 */
export const initYandexSearch = (): (() => void) => {
  let seenKey = mediaKey();
  let seenAt = 0;
  let shownKey: string | undefined;
  let running = false;

  const check = (): void => {
    const key = mediaKey();
    if (key !== seenKey) {
      seenKey = key;
      seenAt = Date.now();
      return;
    }
    if (running || Date.now() - seenAt < YANDEX_SETTLE_MS) return;

    if (key === shownKey) {
      if (lastSidebar && !lastSidebar.isConnected) appendSidebarToPage(lastSidebar);
      return;
    }

    removeSidebar();
    shownKey = key;
    running = true;
    void initSearchEngineSidebar().finally(() => {
      running = false;
    });
  };

  check();
  const timer = setInterval(check, YANDEX_CHECK_MS);
  return () => clearInterval(timer);
};

const removeSidebar = (): void => {
  document.getElementById(SIDEBAR_ID)?.remove();
  removeSkeleton();
  lastSidebar = undefined;
};

const showSkeleton = (serverLabel: string): void => {
  if (document.getElementById(SKELETON_ID)) return;
  injectSkeletonKeyframes();

  const shimmerBg =
    'linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 75%)';
  const shimmerStyle = `background: ${shimmerBg}; background-size: 800px 100%; animation: mcShimmer 1.6s ease-in-out infinite;`;

  const skeleton = document.createElement('div');
  skeleton.id = SKELETON_ID;
  Object.assign(skeleton.style, {
    fontFamily: "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    background: 'linear-gradient(145deg, #1a1130 0%, #120d20 100%)',
    border: '1px solid rgba(123, 47, 190, 0.35)',
    borderRadius: '16px',
    padding: '20px',
    maxWidth: '360px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.45)',
    marginBlock: '1rem',
  });

  skeleton.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.08);">
      <div style="width:32px;height:32px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.05);border-radius:50%;"></div>
      <div style="flex:1;">
        <div style="width:100px;height:14px;background:rgba(255,255,255,0.1);border-radius:4px;"></div>
        <div style="width:150px;height:10px;background:rgba(255,255,255,0.05);border-radius:4px;margin-top:4px;"></div>
      </div>
    </div>
    <div>
      <div style="font-size:11px;color:#a89cc0;margin-bottom:8px;">${t('poweredBy', serverLabel)}</div>
    </div>
    <div style="display:flex;gap:12px;align-items:flex-start;">
      <div style="width:60px;height:90px;border-radius:8px;flex-shrink:0;${shimmerStyle}"></div>
      <div style="flex:1;display:flex;flex-direction:column;gap:8px;padding-top:4px;">
        <div style="width:75%;height:14px;border-radius:4px;${shimmerStyle}"></div>
        <div style="width:40%;height:11px;border-radius:4px;${shimmerStyle}"></div>
        <div style="width:55%;height:20px;border-radius:6px;${shimmerStyle}"></div>
        <div style="width:50%;height:26px;border-radius:6px;margin-top:4px;${shimmerStyle}"></div>
      </div>
    </div>
  `;

  appendSidebarToPage(skeleton);
};

const removeSkeleton = (): void => {
  document.getElementById(SKELETON_ID)?.remove();
};

const injectSidebar = (response: SearchJellyseerrResponse, queryTitle: string): void => {
  if (document.getElementById(SIDEBAR_ID)) return;

  const sidebar = document.createElement('search-sidebar') as HTMLElement & {
    response: SearchJellyseerrResponse;
    queryTitle: string;
  };
  sidebar.id = SIDEBAR_ID;
  sidebar.response = response;
  sidebar.queryTitle = queryTitle;

  lastSidebar = sidebar;
  appendSidebarToPage(sidebar);
};

const appendSidebarToPage = (card: HTMLElement): void => {
  const site = identifySite(window.location.href);

  if (site === 'google') {
    card.style.maxWidth = '100%';
    card.style.width = '100%';
    card.style.boxSizing = 'border-box';
    const rso = document.getElementById('rso');
    if (rso) {
      rso.parentElement?.insertBefore(card, rso);
      return;
    }
    const centerCol = document.getElementById('center_col');
    if (centerCol) {
      centerCol.prepend(card);
      return;
    }
    const search = document.getElementById('search');
    if (search) {
      search.prepend(card);
      return;
    }
  }

  if (site === 'bing') {
    card.style.maxWidth = '100%';
    card.style.width = 'calc(100% - 5rem)';
    card.style.boxSizing = 'border-box';
    const bResults = document.getElementById('b_results');
    if (bResults) {
      bResults.parentElement?.insertBefore(card, bResults);
      return;
    }
    const bContent = document.getElementById('b_content');
    if (bContent) {
      bContent.prepend(card);
      return;
    }
  }

  if (site === 'yandex') {
    card.style.maxWidth = '100%';
    card.style.width = '100%';
    card.style.boxSizing = 'border-box';
    // Yandex's own film card sits in the right column. The column's id and classes are
    // sometimes scrambled (`content__right` becomes a random string), the card's are not,
    // so the sidebar goes right above that card, in whatever column holds it.
    const entityCard =
      document.querySelector('.EntityCard_film') ?? document.querySelector('.EntityCard');
    const entityItem = entityCard?.parentElement;
    if (entityItem?.parentElement) {
      entityItem.parentElement.insertBefore(card, entityItem);
      return;
    }
    const aside =
      document.getElementById('search-result-aside') ?? document.querySelector('.content__right');
    if (aside) {
      aside.prepend(card);
      return;
    }
    const results =
      document.getElementById('search-result') ?? document.querySelector('.content__left');
    if (results?.parentElement) {
      results.parentElement.insertBefore(card, results);
      return;
    }
  }

  Object.assign(card.style, {
    position: 'fixed',
    top: '80px',
    right: '20px',
    zIndex: '99999',
    width: '340px',
  });
  document.body.appendChild(card);
};

/**
 * Attempt to inject a search engine card based on a CheckMediaResponse.
 * This is used for the simplified flow where we have a direct match.
 */
export const tryInjectSearchEngineCard = (
  response: import('../../types/messages.js').CheckMediaResponse,
): void => {
  const SEARCH_CARD_ID = 'media-connector-search-card';
  if (document.getElementById(SEARCH_CARD_ID)) return;

  const status = response.payload.status;
  const serverType = response.payload.serverType ?? 'emby';
  const serverLabel = serverType === 'jellyfin' ? 'Jellyfin' : 'Emby';
  const itemUrl = response.payload.itemUrl;

  const card = document.createElement('div');
  card.id = SEARCH_CARD_ID;
  Object.assign(card.style, {
    fontFamily: "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    background: 'linear-gradient(145deg, #1a1130 0%, #120d20 100%)',
    border: '1px solid rgba(123, 47, 190, 0.35)',
    borderRadius: '16px',
    padding: '20px',
    color: '#e8e0f0',
    boxShadow: '0 4px 24px rgba(0,0,0,0.45)',
    marginBlock: '1rem',
    maxWidth: '360px',
  });

  const headerHtml = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.08);">
      <div style="width:32px;height:32px;flex-shrink:0;">${COMBINED_SVG.replace(/width="48" height="48"/, 'width="32" height="32"')}</div>
      <div>
        <div style="font-weight:700;font-size:15px;color:#d0bcff;">I've got this!</div>
        <div style="font-size:11px;color:#a89cc0;margin-top:2px;">${t('serverStatus', serverLabel)}</div>
      </div>
    </div>
  `;

  let contentHtml = '';
  if (status === 'available' || status === 'partial') {
    const availableText =
      status === 'partial'
        ? t('availableOnServerPartial', serverLabel)
        : t('availableOnServer', serverLabel);
    contentHtml = `
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="font-size:24px;">✅</div>
        <div>
          <div style="font-weight:600;">${availableText}</div>
          <a href="${itemUrl}" target="_blank" style="color:#d0bcff;text-decoration:underline;font-size:13px;">${t('playNow')}</a>
        </div>
      </div>
    `;
  } else if (status === 'unavailable') {
    contentHtml = `
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="font-size:24px;">🚀</div>
        <div>
          <div style="font-weight:600;">${t('notOnServerYet', serverLabel)}</div>
          <div style="font-size:13px;color:#a89cc0;">${t('requestViaJellyseerr')}</div>
        </div>
      </div>
    `;
  }

  card.innerHTML = headerHtml + contentHtml;

  // Try to find a good sidebar spot
  const googleSidebar = document.getElementById('rhs');
  if (googleSidebar) {
    googleSidebar.prepend(card);
    return;
  }

  const bingSidebar = document.getElementById('b_context');
  if (bingSidebar) {
    bingSidebar.prepend(card);
    return;
  }

  // Fallback to absolute positioning if no sidebar
  Object.assign(card.style, {
    position: 'fixed',
    top: '100px',
    right: '20px',
    zIndex: '9999',
  });
  document.body.appendChild(card);
};
