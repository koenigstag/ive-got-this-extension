/**
 * Reading Kinopoisk (kinopoisk.ru) film and series pages. Pure functions over
 * the URL and the DOM, so both the detector and the card code can use them.
 */

export interface KinopoiskTitle {
  readonly id: string;
  readonly mediaType: 'movie' | 'tv';
  /** The Russian title. */
  readonly title: string;
  /** The original title, when it differs ("The Matrix"); absent for Russian titles. */
  readonly originalTitle?: string;
  /** The year of release; for a series, the year it started. */
  readonly year?: number;
}

/**
 * The Kinopoisk id and kind of a title page (`/film/<id>/`, `/series/<id>/`),
 * or undefined for any other page. Sub-pages such as `/film/301/cast/` are not
 * title pages.
 */
export const getKinopoiskTitleId = (
  url: string,
): { id: string; mediaType: 'movie' | 'tv' } | undefined => {
  const match = new URL(url).pathname.match(/^\/(film|series)\/(\d+)\/?$/);
  if (!match) return undefined;
  return { id: match[2], mediaType: match[1] === 'series' ? 'tv' : 'movie' };
};

interface TitleJsonLd {
  readonly '@type'?: string;
  readonly url?: string;
  readonly name?: string;
  readonly alternateName?: string | string[];
  readonly datePublished?: string | number;
}

const clean = (text: string | null | undefined): string | undefined => {
  const value = text?.replace(/\s+/g, ' ').trim();
  return value || undefined;
};

/**
 * Read the title on the current Kinopoisk page from its JSON-LD (name,
 * alternateName = original title, datePublished = year, @type Movie or
 * TVSeries). Kinopoisk moves between titles without a page load and swaps the
 * JSON-LD a moment after the URL, so only an entry whose `url` is this page
 * counts: until it is there, the page is not ready and this returns undefined.
 */
export const readKinopoiskTitle = (doc: Document, url: string): KinopoiskTitle | undefined => {
  const page = getKinopoiskTitleId(url);
  if (!page) return undefined;

  for (const script of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
    let data: TitleJsonLd;
    try {
      data = JSON.parse(script.textContent ?? '') as TitleJsonLd;
    } catch {
      continue;
    }
    if (data['@type'] !== 'Movie' && data['@type'] !== 'TVSeries') continue;
    if (!data.url || getKinopoiskTitleId(new URL(data.url, url).href)?.id !== page.id) continue;

    const title = clean(data.name);
    if (!title) return undefined;
    const original = [data.alternateName ?? []].flat().map(clean).find(Boolean);
    const year = String(data.datePublished ?? '').match(/^(\d{4})/)?.[1];

    return {
      id: page.id,
      mediaType: data['@type'] === 'TVSeries' ? 'tv' : page.mediaType,
      title,
      originalTitle: original && original !== title ? original : undefined,
      year: year ? parseInt(year, 10) : undefined,
    };
  }
  return undefined;
};

/** Titles to search Jellyseerr with, best first: the original title (TMDB's own), then the Russian one. */
export const kinopoiskQueries = (title: KinopoiskTitle): string[] =>
  [title.originalTitle, title.title].filter(
    (query, index, all): query is string => !!query && all.indexOf(query) === index,
  );
