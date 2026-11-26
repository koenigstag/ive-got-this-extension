import { Option } from 'effect';
import type { DetectedMedia, SourceSite } from '../types/index.js';
import { getIviTitleSlug } from './content-script-helpers.js';
import { buildShikimoriSearch, readShikimoriAnime } from './sites/shikimori-page.js';

/**
 * Identify the current site from the URL.
 * @param url - Current page URL
 * @returns The detected source site
 */
export const identifySite = (url: string): SourceSite => {
  const hostname = new URL(url).hostname;

  if (hostname.includes('imdb.com')) return 'imdb';
  if (hostname.includes('trakt.tv')) return 'trakt';
  if (hostname.includes('netflix.com')) return 'netflix';
  if (hostname.includes('amazon.com') || hostname.includes('primevideo.com')) return 'amazon';
  if (hostname.includes('google.com')) return 'google';
  if (hostname.includes('bing.com')) return 'bing';
  // Yandex serves the same results page on yandex.ru, ya.ru and yandex.com.
  if (/^(www\.)?(yandex\.(ru|com)|ya\.ru)$/.test(hostname)) return 'yandex';
  if (hostname.includes('justwatch.com')) return 'justwatch';
  // ivi.ru sends visitors outside Russia to ivi.tv, which runs the same site.
  if (/(^|\.)ivi\.(ru|tv)$/.test(hostname)) return 'ivi';
  // shikimori.one and shiki.one send visitors to shikimori.io; shikimori.me was an earlier domain.
  if (/^(www\.)?(shikimori\.(io|one|me)|shiki\.one)$/.test(hostname)) return 'shikimori';

  return 'unknown';
};

/**
 * Detect media metadata from the current page.
 * Dispatches to site-specific detectors.
 * @returns Detected media info or undefined if no media found
 * @deprecated Prefer `detectMediaOption` for new code.
 */
export const detectMedia = (): DetectedMedia | undefined => {
  const site = identifySite(window.location.href);

  switch (site) {
    case 'imdb':
      return detectFromImdb();
    case 'trakt':
      return detectFromTrakt();
    case 'netflix':
      return detectFromNetflix();
    case 'amazon':
      return detectFromAmazon();
    case 'google':
      return detectFromGoogle();
    case 'bing':
      return detectFromBing();
    case 'yandex':
      return detectFromYandex();
    case 'justwatch':
      return detectFromJustWatch();
    case 'ivi':
      return detectFromIvi();
    case 'shikimori':
      return detectFromShikimori();
    default:
      return undefined;
  }
};

/**
 * Detect media metadata from the current page.
 * Returns `Option<DetectedMedia>` — `Option.some` when media is found,
 * `Option.none()` otherwise.
 */
export const detectMediaOption = (): Option.Option<DetectedMedia> =>
  Option.fromNullable(detectMedia());

/**
 * Extract IMDb ID from URL.
 * @param url - IMDb page URL
 * @returns IMDb ID (e.g., "tt1234567") or undefined
 */
const extractImdbId = (url: string): string | undefined => {
  const match = url.match(/\/(tt\d+)/);
  return match?.[1];
};

/**
 * Extract year from a text string.
 * @param text - Text potentially containing a year
 * @returns Extracted year or undefined
 */
const extractYear = (text: string): number | undefined => {
  const match = text.match(/\b(19|20)\d{2}\b/);
  return match ? parseInt(match[0], 10) : undefined;
};

/**
 * Detect media from IMDb pages.
 * Handles movies, TV shows, seasons, and episodes.
 */
const detectFromImdb = (): DetectedMedia | undefined => {
  const url = window.location.href;
  const imdbId = extractImdbId(url);

  // Get title from page
  const titleElement =
    document.querySelector('[data-testid="hero__pageTitle"] span') ?? document.querySelector('h1');
  const title = titleElement?.textContent?.trim();

  if (!title) return undefined;

  // Check for episode pattern in URL: /title/tt.../episodes?season=X
  const seasonMatch = url.match(/episodes\?season=(\d+)/);
  if (seasonMatch) {
    return {
      type: 'season',
      seriesTitle: title,
      seasonNumber: parseInt(seasonMatch[1], 10),
      imdbId,
    };
  }

  // Check if it's a TV episode (has episode info on page)
  const episodeInfo = document.querySelector(
    '[data-testid="hero-subnav-bar-season-episode-numbers-section"]',
  );
  if (episodeInfo) {
    const seText = episodeInfo.textContent ?? '';
    const seMatch = seText.match(/S(\d+).*?E(\d+)/i);
    if (seMatch) {
      const seriesLink = document.querySelector('[data-testid="hero-title-block__series-link"]');
      const seriesTitle = seriesLink?.textContent?.trim() ?? title;
      return {
        type: 'episode',
        seriesTitle,
        seasonNumber: parseInt(seMatch[1], 10),
        episodeNumber: parseInt(seMatch[2], 10),
        episodeTitle: title,
        imdbId,
      };
    }
  }

  // Check if it's a TV series (has "TV Series" or "TV Mini Series" label)
  const typeIndicator = document.querySelector('[data-testid="hero-title-block__metadata"] li');
  const typeText = typeIndicator?.textContent?.toLowerCase() ?? '';

  if (typeText.includes('tv series') || typeText.includes('tv mini')) {
    const yearText =
      document.querySelector('[data-testid="hero-title-block__metadata"]')?.textContent ?? '';
    return {
      type: 'series',
      title,
      year: extractYear(yearText),
      imdbId,
    };
  }

  // Default to movie
  const yearText =
    document.querySelector('[data-testid="hero-title-block__metadata"]')?.textContent ?? '';
  return {
    type: 'movie',
    title,
    year: extractYear(yearText),
    imdbId,
  };
};

/**
 * Extract IMDb ID from links on the current page.
 * Trakt pages typically have external links to IMDb in the sidebar.
 */
const extractImdbIdFromPage = (): string | undefined => {
  const link = document.querySelector<HTMLAnchorElement>('a[href*="imdb.com/title/tt"]');
  if (link) {
    const match = link.href.match(/(tt\d+)/);
    if (match) return match[1];
  }
  return undefined;
};

/**
 * Extract TMDb ID from links on the current page.
 * Trakt pages typically have external links to TMDb in the sidebar.
 */
const extractTmdbIdFromPage = (): string | undefined => {
  const link = document.querySelector<HTMLAnchorElement>(
    'a[href*="themoviedb.org/movie/"], a[href*="themoviedb.org/tv/"]',
  );
  if (link) {
    const match = link.href.match(/(?:movie|tv)\/(\d+)/);
    if (match) return match[1];
  }
  return undefined;
};

/**
 * Detect media from Trakt.tv pages.
 * Extracts title, year, and external IDs (IMDb, TMDb) from page links.
 */
const detectFromTrakt = (): DetectedMedia | undefined => {
  const url = window.location.href;

  // The content script runs on every Trakt page (the site navigates without
  // reloading), so skip pages that are not a movie or show.
  if (!/^\/(movies|shows)\/[^/]+/.test(window.location.pathname)) return undefined;

  const titleElement = document.querySelector('h1');
  const title = titleElement?.textContent?.trim();
  if (!title) return undefined;

  // `.year` on earlier layouts; app.trakt.tv shows "2008 • 151 eps • TV-14 • Drama"
  // in the summary subtitle.
  const yearElement =
    document.querySelector('.year') ?? document.querySelector('.trakt-summary-subtitle');
  const year = yearElement ? extractYear(yearElement.textContent ?? '') : undefined;

  // Extract external IDs from page links (sidebar external links)
  const imdbId = extractImdbIdFromPage();
  const tmdbId = extractTmdbIdFromPage();

  console.log(
    `[Media Connector] Trakt detection — title: "${title}", year: ${year}, imdbId: ${imdbId ?? 'none'}, tmdbId: ${tmdbId ?? 'none'}`,
  );

  // Trakt movie pages: /movies/movie-slug
  if (url.includes('/movies/')) {
    return { type: 'movie', title, year, imdbId, tmdbId };
  }

  // Trakt show pages with season/episode: /shows/show-slug/seasons/X/episodes/Y
  const episodeMatch = url.match(/\/shows\/[^/]+\/seasons\/(\d+)\/episodes\/(\d+)/);
  if (episodeMatch) {
    return {
      type: 'episode',
      seriesTitle: title,
      seasonNumber: parseInt(episodeMatch[1], 10),
      episodeNumber: parseInt(episodeMatch[2], 10),
      year,
      imdbId,
      tmdbId,
    };
  }

  // Trakt season pages: /shows/show-slug/seasons/X
  const seasonMatch = url.match(/\/shows\/[^/]+\/seasons\/(\d+)/);
  if (seasonMatch) {
    return {
      type: 'season',
      seriesTitle: title,
      seasonNumber: parseInt(seasonMatch[1], 10),
      year,
      imdbId,
      tmdbId,
    };
  }

  // Trakt show pages: /shows/show-slug
  if (url.includes('/shows/')) {
    return { type: 'series', title, year, imdbId, tmdbId };
  }

  return undefined;
};

/**
 * Read the schema.org `Movie` / `TVSeries` block that Netflix's public title
 * pages embed as JSON-LD.
 */
const readNetflixJsonLd = (): { type: 'movie' | 'series'; name?: string } | undefined => {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const data: unknown = JSON.parse(script.textContent ?? '');
      if (!data || typeof data !== 'object') continue;
      const { '@type': type, name } = data as Record<string, unknown>;
      if (type !== 'Movie' && type !== 'TVSeries') continue;
      return {
        type: type === 'TVSeries' ? 'series' : 'movie',
        name: typeof name === 'string' ? name.trim() || undefined : undefined,
      };
    } catch {
      // Not JSON: skip it.
    }
  }
  return undefined;
};

/**
 * Detect media from Netflix title pages: `/title/<id>`, or `/<country>[-<lang>]/title/<id>`
 * that Netflix redirects to (e.g. `/de-en/title/80057281`).
 *
 * The public page (no sign-in) carries a JSON-LD `Movie`/`TVSeries` block with the
 * title, an `<h1>`, and a metadata list (`2022 · 12 · Comedy`, or
 * `2025 · 5 Seasons · 16 · Sci-Fi` for a show). Both the title and the season
 * label follow the page's language.
 */
const detectFromNetflix = (): DetectedMedia | undefined => {
  const jsonLd = readNetflixJsonLd();

  const titleElement =
    document.querySelector('.title-title') ??
    document.querySelector('[data-uia="video-title"]') ??
    document.querySelector('h1');

  const title = jsonLd?.name ?? titleElement?.textContent?.trim();
  if (!title) return undefined;

  const isSeries = jsonLd
    ? jsonLd.type === 'series'
    : !!document.querySelector(
        '[data-uia="episodes"], [data-uia="season-selector"], [data-uia="episode-item"]',
      );

  // A show's year on Netflix is that of its latest season (Stranger Things shows 2025),
  // and its JSON-LD dates are no better, so a series goes without one.
  if (isSeries) {
    return { type: 'series', title };
  }

  // For a film the first metadata item is its release year.
  const yearElement = document.querySelector('[data-uia="metadata"] li');
  const year = yearElement ? extractYear(yearElement.textContent ?? '') : undefined;

  return { type: 'movie', title, year };
};

/**
 * Detect media from Amazon Prime Video pages.
 */
const detectFromAmazon = (): DetectedMedia | undefined => {
  const titleElement =
    document.querySelector('[data-automation-id="title"]') ??
    document.querySelector('.av-detail-section h1') ??
    document.querySelector('h1');

  const title = titleElement?.textContent?.trim();
  if (!title) return undefined;

  const yearElement = document.querySelector('[data-automation-id="release-year-badge"]');
  const year = yearElement ? extractYear(yearElement.textContent ?? '') : undefined;

  // Check for season/episode selectors
  const seasonSelector = document.querySelector('[data-automation-id="season-selector"]');
  if (seasonSelector) {
    return { type: 'series', title, year };
  }

  return { type: 'movie', title, year };
};

/**
 * Detect media from Google search result knowledge panels.
 * Uses `data-attrid="title"` for the title and `data-attrid="subtitle"` for
 * year/type information (e.g. "2019 ‧ Action/Sci-fi ‧ 3h 1m").
 */
const detectFromGoogle = (): DetectedMedia | undefined => {
  const knowledgePanel =
    document.querySelector('[data-attrid="title"]') ?? document.querySelector('.kno-ecr-pt');

  if (!knowledgePanel) return undefined;

  const title = knowledgePanel.textContent?.trim();
  if (!title) return undefined;

  const typeLabel =
    document.querySelector('[data-attrid="subtitle"]') ?? document.querySelector('.kno-ecr-st');
  const typeText = typeLabel?.textContent?.toLowerCase() ?? '';

  const yearMatch = typeText.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? parseInt(yearMatch[0], 10) : undefined;

  // Explicit type keywords in the subtitle
  if (
    typeText.includes('tv series') ||
    typeText.includes('tv show') ||
    typeText.includes('tv mini')
  ) {
    return { type: 'series', title, year };
  }

  if (typeText.includes('film') || typeText.includes('movie')) {
    return { type: 'movie', title, year };
  }

  // Google embeds structured type info in data-maindata on the knowledge panel.
  // e.g. ["FILM"] or "TVM" (TV Movie). Check for these signals.
  const kpElement = document.querySelector<HTMLElement>('[data-maindata]');
  if (kpElement) {
    const maindata = kpElement.getAttribute('data-maindata')?.toUpperCase() ?? '';
    if (maindata.includes('"TV_SERIES"') || maindata.includes('"TV_SHOW"')) {
      return { type: 'series', title, year };
    }
    if (maindata.includes('"FILM"') || maindata.includes('"TVM"')) {
      return { type: 'movie', title, year };
    }
  }

  // Fallback: runtime pattern in subtitle (e.g. "1h 42m", "2h 15m") indicates media.
  // Also check for genre-based data-attrid like "kc:/film/film:cast".
  const hasRuntime = /\d+h\s*\d*m/.test(typeText);
  const hasFilmAttrib = !!document.querySelector('[data-attrid^="kc:/film/"]');
  const hasTvAttrib = !!document.querySelector(
    '[data-attrid^="kc:/tv.tv_show/"], [data-attrid^="kc:/tv/"]',
  );

  if (hasTvAttrib) {
    return { type: 'series', title, year };
  }

  if (hasFilmAttrib || hasRuntime) {
    return { type: 'movie', title, year };
  }

  return undefined;
};

/**
 * Detect media from Bing search result knowledge panels.
 * Uses the `.wpt_title` heading and `.wpt_subtitle` span for
 * year/type information (e.g. "2019 Film").
 */
const detectFromBing = (): DetectedMedia | undefined => {
  const titleElement = document.querySelector<HTMLHeadingElement>('h2.wpt_title');
  if (!titleElement) return undefined;

  const title = titleElement.textContent?.trim();
  if (!title) return undefined;

  const subtitleElement = document.querySelector<HTMLSpanElement>('span.wpt_subtitle');
  const subtitleText = subtitleElement?.textContent?.toLowerCase() ?? '';

  const yearMatch = subtitleText.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? parseInt(yearMatch[0], 10) : undefined;

  if (
    subtitleText.includes('tv series') ||
    subtitleText.includes('tv show') ||
    subtitleText.includes('tv mini')
  ) {
    return { type: 'series', title, year };
  }

  if (subtitleText.includes('film') || subtitleText.includes('movie')) {
    return { type: 'movie', title, year };
  }

  return undefined;
};

/** Words Yandex uses for a series: "сериал", "мультсериал", "5 сезонов", "television series". */
const YANDEX_SERIES_RE =
  /сериал|сезон|\b(?:tv|television|web|animated|anime|mini)[ -]?series\b|\bminiseries\b|\bsitcom\b/i;
/** Words Yandex uses for a film: "фильм", "мультфильм", "film", "movie". */
const YANDEX_MOVIE_RE = /фильм|\bfilm\b|\bmovie\b/i;

/**
 * Read the type from a piece of Yandex text. When both a series word and a film word
 * occur ("2019 film based on the television series"), the one that comes first wins:
 * that is the head noun of the description.
 */
const yandexTypeFromText = (text: string): 'movie' | 'series' | undefined => {
  const series = text.search(YANDEX_SERIES_RE);
  const movie = text.search(YANDEX_MOVIE_RE);
  if (series === -1 && movie === -1) return undefined;
  if (movie === -1) return 'series';
  if (series === -1) return 'movie';
  return series < movie ? 'series' : 'movie';
};

/**
 * The year in a Yandex subtitle: the first comma-separated part that is a year or a
 * range of years ("1999", "2008-2013", "2019–н.в."). A year inside the original
 * title ("Blade Runner 2049, фильм, 2017") is not a part of its own, so it is skipped.
 */
const yandexYearFromSubtitle = (text: string): number | undefined => {
  for (const part of text.split(',')) {
    const match = part.match(/^\s*((?:19|20)\d{2})(?:\s*[-–—].*)?\s*$/);
    if (match) return parseInt(match[1], 10);
  }
  return undefined;
};

/**
 * The card subtitle's own text ("Chernobyl, сериал, 2019"). The rating line and the age
 * badge sit in child elements of the same node, so only its direct text is read; if
 * Yandex ever wraps the text in an element of its own, the text minus the rating is used.
 */
const yandexCardSubtitle = (element: Element | null): string => {
  if (!element) return '';
  const own = [...element.childNodes]
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent?.trim() ?? '')
    .filter(Boolean)
    .join(' ');
  if (own) return own;
  const copy = element.cloneNode(true) as Element;
  copy.querySelectorAll('[class*="Rating"]').forEach((node) => node.remove());
  return copy.textContent?.trim() ?? '';
};

/**
 * Detect media from a Yandex results page (yandex.ru, ya.ru, yandex.com).
 *
 * Yandex shows a film or series in one of two ways:
 *  - a header across the top (`.EntityHeader`): the title in `.EntityHeader-Title`,
 *    "1999, фантастика, США, 136 мин, 18+" in `.EntityHeader-SubtitleText`, and the type
 *    in the tiles' class, `EntitySearchTiles_type_film` or `EntitySearchTiles_type_series`;
 *  - only a card in the right column (`.EntityCard`): the title in `.CardHeader-Title`,
 *    "Chernobyl, сериал, 2019" in `.CardHeader-Subtitle`.
 * Either way the right-column card has `EntityCard_film`, which Yandex sets for films and
 * series alike. People, books, places and the like have no such card and are skipped.
 * yandex.com leaves the card subtitle out: the type, and a film's year, then come from the
 * first sentence of the card's short description ("1999 science fiction action film ...").
 */
const detectFromYandex = (): DetectedMedia | undefined => {
  const card = document.querySelector('.EntityCard_film');
  const tilesClass = [
    ...(document.querySelector('[class*="EntitySearchTiles_type_"]')?.classList ?? []),
  ]
    .find((name) => name.startsWith('EntitySearchTiles_type_'))
    ?.slice('EntitySearchTiles_type_'.length);
  const tilesType =
    tilesClass === 'series' ? 'series' : tilesClass === 'film' ? 'movie' : undefined;
  if (!card && !tilesType) return undefined;

  const headerTitle = document.querySelector('.EntityHeader-Title');
  const title = (
    headerTitle?.getAttribute('title') ||
    headerTitle?.textContent ||
    card?.querySelector('.CardHeader-Title')?.textContent ||
    ''
  ).trim();
  if (!title) return undefined;

  const subtitle =
    document.querySelector('.EntityHeader-SubtitleText')?.textContent?.trim() ||
    yandexCardSubtitle(card?.querySelector('.CardHeader-Subtitle') ?? null);
  const description = (
    card?.querySelector('.RichFactdown-Paragraph')?.textContent?.trim() ?? ''
  ).split(/\.\s/)[0];

  const type = tilesType ?? yandexTypeFromText(subtitle) ?? yandexTypeFromText(description);
  if (!type) return undefined;

  let year = yandexYearFromSubtitle(subtitle);
  if (year === undefined && !subtitle && type === 'movie') {
    const match = description.match(/^\s*((?:19|20)\d{2})\b/);
    year = match ? parseInt(match[1], 10) : undefined;
  }

  return { type, title, year };
};

/**
 * Strip JustWatch title suffixes to extract the clean media title.
 * Common formats:
 *   - "FBI - watch tv show streaming online"
 *   - "One Battle After Another streaming: watch online"
 *   - "Title - watch movie streaming online"
 *   - "Title | JustWatch"
 * @param raw - Raw title from og:title, document.title, etc.
 * @returns Cleaned title or empty string
 */
const cleanJustWatchTitle = (raw: string): string | undefined => {
  const cleaned = raw
    // "Title - watch tv show streaming online" → "Title"
    // "Title - watch movie streaming online"   → "Title"
    .replace(/\s*[-–]\s*watch\s+(tv\s+show|movie|tv\s+series).*$/i, '')
    // "Title streaming: watch online" → "Title"
    .replace(/\s*streaming\s*[:.]?\s*watch.*$/i, '')
    // "Title | JustWatch" → "Title"
    .replace(/\s*\|\s*JustWatch$/i, '')
    .trim();

  return cleaned || undefined;
};

/**
 * Detect media from JustWatch title pages.
 * URL patterns:
 *   - Movies:   /xx/movie/slug
 *   - TV Shows: /xx/tv-show/slug
 *
 * JustWatch is a Vue/Nuxt SPA. Title and year are extracted from the
 * `<meta property="og:title">` tag (e.g. "Title streaming: watch online")
 * and from embedded Apollo/JSON state (`"originalReleaseYear":YYYY`).
 */
const detectFromJustWatch = (): DetectedMedia | undefined => {
  const url = window.location.href;
  const path = new URL(url).pathname;

  // Determine media type from URL path segment
  const isMovie = /\/movie\//.test(path);
  const isTvShow = /\/tv-show\//.test(path);
  if (!isMovie && !isTvShow) return undefined;

  // Extract title: prefer og:title meta, fall back to document.title, then h1
  let title: string | undefined;

  const ogTitle = document
    .querySelector<HTMLMetaElement>('meta[property="og:title"]')
    ?.getAttribute('content');
  if (ogTitle) {
    // Strip common JustWatch suffixes:
    //   "Title streaming: watch online"
    //   "Title - watch tv show streaming online"
    //   "Title - watch movie streaming online"
    //   "Title | JustWatch"
    title = cleanJustWatchTitle(ogTitle);
  }

  if (!title) {
    title = cleanJustWatchTitle(document.title ?? '');
  }

  if (!title) {
    // Try the hero title element (Vue scoped, but the class is stable)
    const heroTitle = document.querySelector('h1');
    title = heroTitle?.textContent?.trim();
  }

  if (!title) return undefined;

  // Extract year: look in the embedded JSON state for originalReleaseYear
  let year: number | undefined;

  // Try inline scripts containing Apollo cache data
  const scripts = document.querySelectorAll('script');
  for (const script of scripts) {
    const text = script.textContent ?? '';
    const yearMatch = text.match(/"originalReleaseYear"\s*:\s*(\d{4})/);
    if (yearMatch) {
      year = parseInt(yearMatch[1], 10);
      break;
    }
  }

  // Fallback: try extracting year from visible release year element
  if (!year) {
    const releaseYearEl = document.querySelector('.release-year');
    if (releaseYearEl) {
      year = extractYear(releaseYearEl.textContent ?? '');
    }
  }

  // Fallback: try the og:title or document.title for a year in parentheses
  if (!year && ogTitle) {
    year = extractYear(ogTitle);
  }

  if (isMovie) {
    return { type: 'movie', title, year };
  }

  // TV show — check for season in the URL
  // Season page: /xx/tv-show/slug/season-N
  const seasonMatch = path.match(/\/tv-show\/[^/]+\/season-(\d+)$/);
  if (seasonMatch) {
    return {
      type: 'season',
      seriesTitle: title,
      seasonNumber: parseInt(seasonMatch[1], 10),
      year,
    };
  }

  return { type: 'series', title, year };
};

/** Year in parentheses that ivi appends to tell same-named titles apart: "Возмездие (2019)". */
const IVI_TITLE_YEAR = /\s*\(((?:19|20)\d{2})\)\s*$/;

/**
 * Clean an ivi.ru title from og:title or the page heading.
 *   - "Химера — на Иви!"                     → "Химера"
 *   - "Химера 1 сезон 3 серия"               → "Химера" (episode pages)
 *   - "Сериал Химера смотреть онлайн"        → "Химера" (h1)
 * The year disambiguator ("Возмездие (2019)") is kept here and split off by
 * the caller.
 */
export const cleanIviTitle = (raw: string): string | undefined => {
  const cleaned = raw
    // "Title — на Иви!" / "Title — on ivi"
    .replace(/\s+[—–-]\s+[^—–-]*(?:иви|ivi)!?\s*$/i, '')
    // "Сериал Title смотреть онлайн" (h1)
    .replace(/\s+смотреть\s+онлайн.*$/i, '')
    .replace(
      /^(?:Фильм|Сериал|Мультфильм|Мультсериал|Аниме|Шоу|Видео|Спектакль|Концерт|Передача|Программа)\s+/i,
      '',
    )
    // Episode pages: "Title 1 сезон 3 серия"
    .replace(/\s+\d+\s+(?:сезон|серия|season|episode)(?:\s.*)?$/i, '')
    .trim();

  return cleaned || undefined;
};

/**
 * Detect media from ivi.ru (and ivi.tv, where ivi.ru sends visitors from
 * outside Russia) title pages: `/watch/<slug>` and its episode pages.
 *
 * ivi is a single-page app: the content script reads only what the app keeps
 * up to date in the DOM after in-app navigation — og:title, the h1 and the
 * parameter row under the title (year, "N сезон"). The pages carry no IMDb,
 * TMDB or Kinopoisk ids, so the title (usually Russian) and the year are all
 * there is to search Jellyseerr with.
 */
const detectFromIvi = (): DetectedMedia | undefined => {
  const url = window.location.href;
  const slug = getIviTitleSlug(url);
  if (!slug) return undefined;

  const ogTitle = document
    .querySelector<HTMLMetaElement>('meta[property="og:title"]')
    ?.getAttribute('content');
  const heading = document.querySelector('h1')?.textContent ?? '';

  const rawTitle = (ogTitle && cleanIviTitle(ogTitle)) || cleanIviTitle(heading);
  if (!rawTitle) return undefined;

  const titleYear = rawTitle.match(IVI_TITLE_YEAR);
  const title = rawTitle.replace(IVI_TITLE_YEAR, '').trim() || rawTitle;

  // The parameter row holds separate elements: "8,4", "2019", "1 сезон", "16+".
  const params = document.querySelector('[data-test="meta_params"]');
  const paramTexts = params
    ? Array.from(params.querySelectorAll('*'))
        .filter((el) => el.children.length === 0)
        .map((el) => el.textContent?.trim() ?? '')
    : [];

  // "2019" for a film, "2022-2023" for a show that ran several years.
  let year: number | undefined;
  for (const text of paramTexts) {
    const match = text.match(/^((?:19|20)\d{2})(?:\s*[-–—]\s*\d{2,4})?$/);
    if (match) {
      year = parseInt(match[1], 10);
      break;
    }
  }
  if (!year && titleYear) year = parseInt(titleYear[1], 10);

  const path = new URL(url).pathname;
  const isSeries =
    /\/watch\/[^/]+\/(?:\d+|season\d+)\/?$/.test(path) ||
    !!document.querySelector('[data-test="serieBadge"], [data-test="series"]') ||
    paramTexts.some((text) => /^\d+\s+(?:сезон|season)/i.test(text));

  console.log(
    `[Media Connector] ivi detection — title: "${title}", year: ${year}, type: ${isSeries ? 'series' : 'movie'}`,
  );

  // Episode pages are treated as the show: the card is about the series.
  return isSeries ? { type: 'series', title, year } : { type: 'movie', title, year };
};

/**
 * Detect the anime on a Shikimori anime page (`/animes/<id>-<slug>`). The
 * title is the first one the card searches with (English, else romaji, else
 * Russian); OVAs, ONAs and specials count as series, and a sequel's year is
 * left out because TMDB has the show, not the season.
 */
const detectFromShikimori = (): DetectedMedia | undefined => {
  const anime = readShikimoriAnime(document, window.location.href);
  if (!anime) return undefined;
  const search = buildShikimoriSearch(anime);
  const title = search.queries[0];
  if (!title) return undefined;
  return anime.kind === 'movie'
    ? { type: 'movie', title, year: search.year }
    : { type: 'series', title, year: search.year };
};
