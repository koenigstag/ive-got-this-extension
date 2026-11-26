import { Option, Effect } from 'effect';
import { detectMediaOption } from './detect-media.js';
import { buildCheckPayloadEffect } from './content-script-helpers.js';
import type { JellyseerrResultItem, SearchJellyseerrResponse } from '../types/messages.js';
import { t } from '../i18n/index.js';
import { dialogTargetFromResult, openMediaDialog } from './media-dialog.js';
import { prowlarrSvg } from '../assets/prowlarr-icon.svg.js';

/**
 * Detect media from the current page, returning `undefined` when nothing is found.
 * Wraps `detectMediaOption` for convenient use at the boundary.
 */
export const tryDetectMedia = () => Option.getOrUndefined(detectMediaOption());

/**
 * Build a CHECK_MEDIA payload from detected media (sync boundary helper).
 */
export const buildPayload = (media: NonNullable<ReturnType<typeof tryDetectMedia>>) =>
  Effect.runSync(buildCheckPayloadEffect(media));

/**
 * Send a message to the extension service worker.
 * Gracefully handles "Extension context invalidated" (after reload/update).
 */
export const sendMessage = <T>(message: unknown): Promise<T | undefined> => {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
      console.warn(
        "[I've got this!] Extension context unavailable (extension was reloaded). Refresh the page.",
      );
      resolve(undefined);
      return;
    }
    try {
      chrome.runtime.sendMessage(message, (response: T) => {
        if (chrome.runtime.lastError) {
          console.error("[I've got this!] sendMessage error:", chrome.runtime.lastError.message);
          resolve(undefined);
          return;
        }
        resolve(response);
      });
    } catch (e) {
      console.warn("[I've got this!] sendMessage failed (context invalidated):", e);
      resolve(undefined);
    }
  });
};

/**
 * Open a URL in a new tab through the service worker. A tab the extension opens carries the
 * site's SameSite cookies, which a link clicked on a foreign page would not (Jellyseerr's
 * session cookie, for one).
 */
export const openInNewTab = (url: string): Promise<unknown> =>
  sendMessage({ type: 'OPEN_TAB', payload: { url } });

/**
 * Open the extension's settings from a page. Content scripts can't open the popup
 * themselves, so the service worker does it (or opens the same page in a tab).
 */
export const openExtensionSettings = (): Promise<unknown> => sendMessage({ type: 'OPEN_SETTINGS' });

export const EMBY_SVG = `<svg width="48" height="48" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Emby"><path d="m97.1 229.4 26.5 26.5L0 379.5l132.4 132.4 26.5-26.5L282.5 609l141.2-141.2-26.5-26.5L512 326.5 379.6 194.1l-26.5 26.5L229.5 97z" fill="#52b54b" transform="translate(0 -97)"/><path d="M196.8 351.2v-193L366 254.7 281.4 303z" fill="#fff" transform="translate(0 97)"/></svg>`;

export const JELLYFIN_SVG = `<svg width="48" height="48" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Jellyfin"><defs><linearGradient id="jellyfin-gradient-cs" x1="110.25" y1="213.3" x2="496.14" y2="436.09" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#aa5cc3"/><stop offset="1" stop-color="#00a4dc"/></linearGradient></defs><g transform="translate(-5.42, -7.37)"><path d="M261.42,201.62c-20.44,0-86.24,119.29-76.2,139.43s142.48,19.92,152.4,0S281.86,201.63,261.42,201.62Z" fill="url(#jellyfin-gradient-cs)"/><path d="M261.42,23.3C199.83,23.3,1.57,382.73,31.8,443.43s429.34,60,459.24,0S323,23.3,261.42,23.3ZM411.9,390.76c-19.59,39.33-281.08,39.77-300.9,0S221.1,115.48,261.45,115.48,431.49,351.42,411.9,390.76Z" fill="url(#jellyfin-gradient-cs)"/></g></svg>`;

export const COMBINED_SVG = `<svg width="48" height="48" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="I've got this!">
  <defs>
    <linearGradient id="jellyfin-gradient-combined-cs" x1="110.25" y1="213.3" x2="496.14" y2="436.09" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#aa5cc3" />
      <stop offset="1" stop-color="#00a4dc" />
    </linearGradient>
    <linearGradient id="a-combined-cs" x1="-2254.016" x2="-2267.51" y1="-2831.433" y2="-2961.618" gradientTransform="matrix(1.75 0 0 -1.75 4099.705 -4631.96)" gradientUnits="userSpaceOnUse"><stop offset="0" style="stop-color:#502d95" /><stop offset=".1" style="stop-color:#6d37ac" /><stop offset=".57" style="stop-color:#6786d1" /></linearGradient>
    <linearGradient id="b-combined-cs" x1="-2175.81" x2="-2189.303" y1="-2839.483" y2="-2969.721" gradientTransform="matrix(1.75 0 0 -1.75 4099.705 -4631.96)" gradientUnits="userSpaceOnUse"><stop offset="0" style="stop-color:#502d95" /><stop offset=".1" style="stop-color:#6d37ac" /><stop offset=".57" style="stop-color:#6786d1" /></linearGradient>
    <linearGradient id="c-combined-cs" x1="-1831.757" x2="-1831.757" y1="-2576.996" y2="-2695.45" gradientTransform="matrix(2.12 0 0 -2.12 4199.46 -5137.32)" gradientUnits="userSpaceOnUse"><stop offset="0" style="stop-color:#763dcd" /><stop offset=".22" style="stop-color:#8d61eb" /><stop offset=".37" style="stop-color:#8c86ec" /><stop offset=".64" style="stop-color:#748ce8" /><stop offset=".9" style="stop-color:#6ba1e6" /></linearGradient>
    <linearGradient id="d-combined-cs" x1="-1891.134" x2="-1891.134" y1="-2576.996" y2="-2695.45" gradientTransform="matrix(2.12 0 0 -2.12 4199.46 -5137.32)" gradientUnits="userSpaceOnUse"><stop offset="0" style="stop-color:#763dcd" /><stop offset=".22" style="stop-color:#8d61eb" /><stop offset=".37" style="stop-color:#8c86ec" /><stop offset=".64" style="stop-color:#748ce8" /><stop offset=".9" style="stop-color:#6ba1e6" /></linearGradient>
    <linearGradient id="e-combined-cs" x1="-1922.004" x2="-1922.004" y1="-2576.996" y2="-2695.45" gradientTransform="matrix(2.12 0 0 -2.12 4199.46 -5137.32)" gradientUnits="userSpaceOnUse"><stop offset="0" style="stop-color:#763dcd" /><stop offset=".22" style="stop-color:#8d61eb" /><stop offset=".37" style="stop-color:#8c86ec" /><stop offset=".64" style="stop-color:#748ce8" /><stop offset=".9" style="stop-color:#6ba1e6" /></linearGradient>
    <linearGradient id="f-combined-cs" x1="-1862.421" x2="-1862.421" y1="-2576.996" y2="-2695.45" gradientTransform="matrix(2.12 0 0 -2.12 4199.46 -5137.32)" gradientUnits="userSpaceOnUse"><stop offset="0" style="stop-color:#763dcd" /><stop offset=".22" style="stop-color:#8d61eb" /><stop offset=".37" style="stop-color:#8c86ec" /><stop offset=".64" style="stop-color:#748ce8" /><stop offset=".9" style="stop-color:#6ba1e6" /></linearGradient>
    <linearGradient id="g-combined-cs" x1="-1735.548" x2="-1586.936" y1="-2673.095" y2="-2838.19" gradientTransform="matrix(1.79 0 0 -1.79 3246.155 -4657.91)" gradientUnits="userSpaceOnUse"><stop offset="0" style="stop-color:#c395fc" /><stop offset="1" style="stop-color:#4f65f5" /></linearGradient>
    <linearGradient id="h-combined-cs" x1="-1059.872" x2="-1059.872" y1="-6378.031" y2="-6594.775" gradientTransform="matrix(.51 0 0 -.51 687.865 -3205.53)" gradientUnits="userSpaceOnUse"><stop offset="0" style="stop-color:#fff;stop-opacity:.4" /><stop offset="1" style="stop-color:#fff;stop-opacity:0" /></linearGradient>
    <linearGradient id="i-combined-cs" x1="-1351.382" x2="-1485.195" y1="-3908.894" y2="-4007.24" gradientTransform="matrix(1.02 0 0 -1.02 1657.5 -3832.45)" gradientUnits="userSpaceOnUse"><stop offset="0" style="stop-color:#f9f9f9" /><stop offset="1" style="stop-color:#f9f9f9;stop-opacity:0" /></linearGradient>
    <linearGradient id="j-combined-cs" x1="-1293.035" x2="-1228.344" y1="-3139.552" y2="-3205.578" gradientTransform="matrix(1.43 0 0 -1.43 2027.665 -4326.01)" gradientUnits="userSpaceOnUse"><stop offset="0" style="stop-color:#0043a2" /><stop offset="1" style="stop-color:#00133a" /></linearGradient>
  </defs>
  <g transform="translate(128, 10) scale(0.5)">
    <g transform="translate(0, -97)">
      <path d="m97.1 229.4 26.5 26.5L0 379.5l132.4 132.4 26.5-26.5L282.5 609l141.2-141.2-26.5-26.5L512 326.5 379.6 194.1l-26.5 26.5L229.5 97z" fill="#52b54b" />
      <path d="M196.8 351.2v-193L366 254.7 281.4 303z" fill="#fff" transform="translate(0 97)" />
    </g>
  </g>
  <g transform="translate(0, 240) scale(0.5)">
    <g transform="translate(-5.42, -7.37)">
      <path d="M261.42,201.62c-20.44,0-86.24,119.29-76.2,139.43s142.48,19.92,152.4,0S281.86,201.63,261.42,201.62Z" fill="url(#jellyfin-gradient-combined-cs)" />
      <path d="M261.42,23.3C199.83,23.3,1.57,382.73,31.8,443.43s429.34,60,459.24,0S323,23.3,261.42,23.3ZM411.9,390.76c-19.59,39.33-281.08,39.77-300.9,0S221.1,115.48,261.45,115.48,431.49,351.42,411.9,390.76Z" fill="url(#jellyfin-gradient-combined-cs)" />
    </g>
  </g>
  <g transform="translate(256, 240) scale(0.42) translate(30, 30)">
    <g transform="translate(0, -97)">
      <path d="m170.9 314-27-6s-6.2 39.6-8.6 59.5c-3.8 32.1-8.4 76.5-6.6 110.5 2 37.4 12.2 73.4 15.6 73.4s-1.8-22.9.5-73.3c1.5-33.6 7.1-74 13.8-110.5 3.3-18 12.9-53.4 12.9-53.4h-.6z" fill="url(#a-combined-cs)" />
      <path d="M284.8 311.2h8.3c11.1 41.4 13.2 101.1 10.8 146.1-2.6 49.5-16.2 97.2-20.6 97.2s2.4-30.3-.7-97.1C280.4 412.9 271 371 270 311.2z" fill="url(#b-combined-cs)" />
      <path d="M309.8 181.6h13.3c17.8 66.2 26.1 161.9 22.2 234-4.2 79.4-25.9 155.7-33.1 155.7s3.8-48.6-1.1-155.6c-3.3-71.4-23.5-138.4-25.1-234.2z" fill="url(#c-combined-cs)" />
      <path d="M196.6 180.1h-13.3c-17.8 66.2-26.1 161.9-22.2 234 4.2 79.4 25.9 155.7 33.1 155.7s-3.8-48.6 1.1-155.6c3.3-71.4 23.5-138.4 25.1-234.2h-23.8z" fill="url(#d-combined-cs)" />
      <path d="m155.6 150-30.2-10.8s-11.1 70.7-15.3 106.2c-6.7 57.3-20 136.6-16.7 197.3 3.6 66.8 21.8 131.1 27.8 131.1s-3.2-40.9 1-131c2.8-60.1 21.2-117 27.4-197.4 2.5-31.9 7.3-95.5 7.3-95.5z" fill="url(#e-combined-cs)" />
      <path d="m255.5 181.6-27.3 4.6s3.6 53 3.6 83.1c0 48.9 1.9 98.2 1.8 149.5-.2 58.9 9.7 157.6 14.8 157.6s21.7-127 25.2-203c2.3-50.7-5.2-95.1-6.5-125.4-1.2-27-5-63.4-5-63.4z" fill="url(#f-combined-cs)" />
      <path d="M405.8 197.7c0 68.8-11.7 73-30.8 102.1-13.8 20.9 14.1 37.1 2.9 42.9-13.3 6.9-9.1-5.6-35.6-12.7-11.5-3-36.5.3-46.6 2.3-10 1.9-40.6-15.1-48.7-17.3-12.1-3.3-41.8 12.5-59.9 12.5s-37-15.8-61.1-9.3c-28.6 7.7-63.1 26.3-68.3 20.2-10-11.7 21.9-20.6 10-41.4-7.5-13.2-33.4-47.9-34.2-83-2.4-112.8 91-208.1 191.1-208.1s181.1 86.8 181.1 183.9" fill="url(#g-combined-cs)" />
      <path d="M218.4 41.7C163.7 41.7 87.3 98.3 87.3 153c0 6.1-4.9 11-11 11s-11-4.9-11-11c0-66.8 86.2-133.2 153.1-133.2 6.1 0 11 4.9 11 11s-5 10.9-11 10.9" fill-rule="evenodd" clip-rule="evenodd" fill="url(#h-combined-cs)" />
      <path d="M299.3 248.5c-5.8 9.5-13.7 17.1-23 22.3-4 2.2-8.2 3.9-12.6 5.2-13.1 5.9-27.7 9-42.6 9.3-50.8.9-93-31.6-94.7-72.8-.8-20.2 11.3-41.2 20.6-57.3 7.9-13.7 21.5-37.2 39.4-46.6 36.5-19.2 85.8 1.1 110.4 45.6 7.1 12.9 11.7 27 13.2 41.1 1.1 4.6 1.8 9.3 1.8 14 .2 12.2-3.4 24.3-10.2 35.1-.7 1.4-1.4 2.7-2.2 4 0 .1-.1.1-.1.1" fill="url(#i-combined-cs)" />
      <path d="M219 147.4c31.7 0 57.3 25.7 57.3 57.3S250.6 262 219 262s-57.3-25.7-57.3-57.3c0-5.9.9-11.5 2.5-16.9 4.5 10 14.5 16.9 26.1 16.9 15.8 0 28.6-12.9 28.6-28.6 0-11.6-6.9-21.7-16.9-26.1 5.4-1.7 11-2.5 17-2.6" fill="url(#j-combined-cs)" />
    </g>
  </g>
</svg>`;

/**
 * The server's logo in one colour, for the buttons that open a title on the
 * server: white, as the button text, because the full-colour logos melt into
 * the blue (Jellyfin) and green (Emby) buttons. Emby's play mark is cut out in
 * the button's colour. Decorative: the button text names the server.
 */
export const serverButtonLogo = (serverLabel: string, background: string, size = 14): string => {
  const svg =
    serverLabel === 'Jellyfin'
      ? JELLYFIN_SVG.replace(/<defs>[\s\S]*?<\/defs>/, '').replace(
          /fill="url\(#jellyfin-gradient-cs\)"/g,
          'fill="currentColor"',
        )
      : EMBY_SVG.replace(/fill="#52b54b"/g, 'fill="currentColor"').replace(
          /fill="#fff"/g,
          `fill="${background}"`,
        );
  return svg
    .replace(/ aria-label="[^"]*"/, '')
    .replace(
      'width="48" height="48"',
      `width="${size}" height="${size}" aria-hidden="true" style="flex-shrink:0"`,
    );
};

/** Put an icon before a button's text, lined up with it. */
const withLeadingIcon = (button: HTMLButtonElement, icon: string): void => {
  Object.assign(button.style, { display: 'inline-flex', alignItems: 'center', gap: '6px' });
  button.insertAdjacentHTML('afterbegin', icon);
};

/**
 * Create a styled action button.
 */
export const createActionButton = (
  text: string,
  bg: string,
  hoverBg: string,
): HTMLButtonElement => {
  const btn = document.createElement('button');
  btn.textContent = text;
  Object.assign(btn.style, {
    display: 'inline-block',
    padding: '5px 12px',
    border: 'none',
    borderRadius: '6px',
    background: bg,
    color: '#fff',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.15s',
    lineHeight: '1.4',
  });
  btn.addEventListener('mouseenter', () => {
    btn.style.background = hoverBg;
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = bg;
  });
  return btn;
};

/**
 * Build an HTML string for a status badge.
 */
export const buildStatusBadge = (status: JellyseerrResultItem['status']): string => {
  const map: Record<JellyseerrResultItem['status'], { label: string; bg: string; fg: string }> = {
    available: {
      label: `✓ ${t('statusAvailable')}`,
      bg: 'rgba(76,175,80,0.15)',
      fg: '#81C784',
    },
    partial: { label: `◐ ${t('statusPartial')}`, bg: 'rgba(255,152,0,0.15)', fg: '#FFB74D' },
    pending: { label: `⏳ ${t('statusPending')}`, bg: 'rgba(97,97,97,0.2)', fg: '#BDBDBD' },
    processing: {
      label: `⚙ ${t('statusProcessing')}`,
      bg: 'rgba(97,97,97,0.2)',
      fg: '#BDBDBD',
    },
    unknown: { label: `? ${t('statusUnknown')}`, bg: 'rgba(97,97,97,0.2)', fg: '#BDBDBD' },
    not_requested: {
      label: t('statusNotRequested'),
      bg: 'rgba(123,47,190,0.15)',
      fg: '#CE93D8',
    },
  };

  const { label, bg, fg } = map[status];
  return `<span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600;background:${bg};color:${fg};">${label}</span>`;
};

/**
 * The one button of a Jellyseerr result, by the title's state: the server name on a title
 * that is there, "Already requested", or "Request…". Each opens the media dialog.
 */
export const resultAction = (
  status: JellyseerrResultItem['status'],
  serverLabel: string,
): {
  readonly text: string;
  readonly background: string;
  readonly hover: string;
  /** The server's logo, drawn before the text on a title that is on the server. */
  readonly icon?: string;
} => {
  if (status === 'available' || status === 'partial') {
    const isJellyfin = serverLabel === 'Jellyfin';
    const background = isJellyfin ? '#00A4DC' : '#4CAF50';
    return {
      text: status === 'partial' ? t('serverPartial', serverLabel) : serverLabel,
      background,
      hover: isJellyfin ? '#0088B8' : '#388E3C',
      icon: serverButtonLogo(serverLabel, background),
    };
  }
  if (status === 'pending' || status === 'processing') {
    return { text: `⏳ ${t('requestPending')}`, background: '#616161', hover: '#424242' };
  }
  return { text: `＋ ${t('requestMore')}`, background: '#7B2FBE', hover: '#5E1F9B' };
};

/**
 * Build a single result row with poster, title, status badge, and its one button.
 */
export const buildResultRow = (item: JellyseerrResultItem, serverLabel: string): HTMLDivElement => {
  const row = document.createElement('div');
  Object.assign(row.style, {
    display: 'flex',
    gap: '12px',
    marginBottom: '12px',
    alignItems: 'flex-start',
  });

  /* poster */
  const poster = document.createElement('div');
  Object.assign(poster.style, {
    width: '60px',
    minWidth: '60px',
    height: '90px',
    borderRadius: '8px',
    overflow: 'hidden',
    background: '#2a2040',
    flexShrink: '0',
  });
  if (item.posterUrl) {
    poster.innerHTML = `<img src="${item.posterUrl}" alt="${item.title}" style="width:100%;height:100%;object-fit:cover;" />`;
  } else {
    poster.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:28px;">🎬</div>`;
  }
  row.appendChild(poster);

  /* info column */
  const info = document.createElement('div');
  Object.assign(info.style, {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flex: '1',
    minWidth: '0',
  });

  const typeLabel = item.mediaType === 'movie' ? t('typeMovie') : t('typeTvShow');
  const yearStr = item.year ? ` (${item.year})` : '';

  info.innerHTML = `
    <div style="font-weight:600;font-size:14px;color:#f0e8ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
      ${item.title}${yearStr}
    </div>
    <div style="font-size:11px;color:#a89cc0;">${typeLabel}</div>
    ${buildStatusBadge(item.status)}
  `;

  /* action buttons */
  const btnContainer = document.createElement('div');
  Object.assign(btnContainer.style, {
    marginTop: '6px',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  });

  /* One button, as on Trakt: it opens the media dialog, which has the server link,
     the Jellyseerr state, the request and the seasons. */
  const action = resultAction(item.status, serverLabel);
  const btn = createActionButton(action.text, action.background, action.hover);
  if (action.icon) withLeadingIcon(btn, action.icon);
  btn.addEventListener('click', () => openMediaDialog(dialogTargetFromResult(item)));
  btnContainer.appendChild(btn);

  info.appendChild(btnContainer);
  row.appendChild(info);
  return row;
};

/**
 * Create a simple info/status row with emoji, title, and description.
 */
export const createInfoRow = (
  emoji: string,
  title: string,
  description: string,
): HTMLDivElement => {
  const row = document.createElement('div');
  Object.assign(row.style, { padding: '8px 0' });
  row.innerHTML = `
    <div style="font-weight:600;font-size:14px;margin-bottom:4px;">
      ${emoji} ${title}
    </div>
    <div style="font-size:12px;color:#a89cc0;">${description}</div>
  `;
  return row;
};

/**
 * Prowlarr's search page for a title. Prowlarr's web app runs the search from
 * the URL (`query`, `categories`); Newznab categories 2000 = movies, 5000 = TV.
 */
export const buildProwlarrSearchUrl = (
  prowlarrUrl: string,
  query: string,
  mediaType?: 'movie' | 'tv',
): string => {
  const categories = mediaType === 'movie' ? '2000' : mediaType === 'tv' ? '5000' : '2000,5000';
  return `${prowlarrUrl.replace(/\/+$/, '')}/search?query=${encodeURIComponent(query)}&categories=${categories}`;
};

/**
 * What a card shows when Jellyseerr found nothing, typically a title TMDB
 * doesn't have, so it can't be requested:
 * - the title on the media server, when the service worker found it there by
 *   name (downloaded by hand), with a Play button; otherwise "No results";
 * - with Prowlarr set up, "Find a release", which opens Prowlarr's search for
 *   the title in a new tab (the download then goes to Prowlarr's client).
 */
export const createNotFoundRows = (
  response: SearchJellyseerrResponse,
  queryTitle: string,
  mediaType?: 'movie' | 'tv',
): HTMLDivElement => {
  const { serverMatch, prowlarrUrl, serverType } = response.payload;
  const serverLabel = serverType === 'jellyfin' ? 'Jellyfin' : 'Emby';
  const container = document.createElement('div');
  container.className = 'media-connector-not-found';

  container.appendChild(
    serverMatch
      ? createInfoRow(
          '✓',
          t(
            serverMatch.status === 'partial' ? 'availableOnServerPartial' : 'availableOnServer',
            serverLabel,
          ),
          t('foundOnServerByName', queryTitle),
        )
      : createInfoRow('🔍', t('noResults'), t('notFoundOnJellyseerr', queryTitle)),
  );

  const buttons = document.createElement('div');
  Object.assign(buttons.style, { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '2px' });

  if (serverMatch) {
    const isJellyfin = serverLabel === 'Jellyfin';
    const background = isJellyfin ? '#00A4DC' : '#4CAF50';
    const play = createActionButton(
      t('playOnServer', serverLabel),
      background,
      isJellyfin ? '#0088B8' : '#388E3C',
    );
    withLeadingIcon(play, serverButtonLogo(serverLabel, background));
    play.dataset.action = 'play-on-server';
    play.addEventListener('click', () => window.open(serverMatch.itemUrl, '_blank'));
    buttons.appendChild(play);
  }

  if (prowlarrUrl) {
    const find = createActionButton(t('findRelease'), '#5c6370', '#474c56');
    Object.assign(find.style, { display: 'inline-flex', alignItems: 'center', gap: '6px' });
    find.insertAdjacentHTML('afterbegin', prowlarrSvg(14));
    find.dataset.action = 'find-release';
    find.title = t('findReleaseHint', queryTitle);
    find.addEventListener('click', () => {
      void openInNewTab(buildProwlarrSearchUrl(prowlarrUrl, queryTitle, mediaType));
    });
    buttons.appendChild(find);
  }

  if (buttons.childElementCount > 0) container.appendChild(buttons);
  return container;
};

/**
 * Inject a CSS @keyframes rule for the skeleton shimmer animation.
 * Only injected once.
 */
export const injectSkeletonKeyframes = (): void => {
  if (document.getElementById('media-connector-skeleton-style')) return;
  const style = document.createElement('style');
  style.id = 'media-connector-skeleton-style';
  style.textContent = `
    @keyframes mcShimmer {
      0%   { background-position: -400px 0; }
      100% { background-position: 400px 0;  }
    }
  `;
  document.head.appendChild(style);
};
