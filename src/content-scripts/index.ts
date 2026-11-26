import { identifySite } from './detect-media.js';
import { sendMessage, handleRequestClick, tryDetectMedia, buildPayload } from './common-ui.js';
import { initTrakt } from './sites/trakt.js';
import { initImdb } from './sites/imdb.js';
import { initJustWatchSPA } from './sites/justwatch.js';
import { initIvi } from './sites/ivi.js';
import { initShikimori } from './sites/shikimori.js';
import { initSearchEngineSidebar, initYandexSearch } from './sites/search-engine.js';
import { injectStatusIndicator } from './fallback.js';
import type { CheckMediaResponse, GetConfigResponse } from '../types/messages.js';
import { setLanguage } from '../i18n/index.js';

export { identifySite, handleRequestClick, tryDetectMedia, buildPayload };

/**
 * Content script entry point.
 * Detects media on the current page and injects the status indicator.
 */
const init = async (): Promise<void> => {
  const site = identifySite(window.location.href);
  console.log("[I've got this!] init: site =", site, ', URL =', window.location.href);
  if (site === 'unknown') return;

  // UI language from the popup setting ("auto" follows the browser).
  const configRes = await sendMessage<GetConfigResponse>({ type: 'GET_CONFIG' });
  setLanguage(configRes?.payload.language);

  if (site === 'trakt') {
    initTrakt();
    return;
  }

  if (site === 'google' || site === 'bing') {
    initSearchEngineSidebar();
    return;
  }

  if (site === 'yandex') {
    initYandexSearch();
    return;
  }

  if (site === 'imdb') {
    initImdb();
    return;
  }

  if (site === 'justwatch') {
    initJustWatchSPA();
    return;
  }

  if (site === 'ivi') {
    initIvi();
    return;
  }

  if (site === 'shikimori') {
    initShikimori();
    return;
  }

  // Non-SPA sites: detect once and inject
  const media = tryDetectMedia();
  if (!media) return;

  const response = await sendMessage<CheckMediaResponse>({
    type: 'CHECK_MEDIA',
    payload: buildPayload(media),
  });

  if (response) {
    injectStatusIndicator(response, media.type);
  }
};

init();
