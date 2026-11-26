/**
 * Reading TMDB (themoviedb.org) title pages. Pure functions over the URL and
 * the DOM, so both the detector and the card code can use them.
 */

export interface TmdbTitle {
  readonly mediaType: 'movie' | 'tv';
  readonly tmdbId: number;
  /** The title as the page shows it, in the page's language. */
  readonly title?: string;
  readonly year?: number;
}

/**
 * The media type and TMDB id of a TMDB title page (`/movie/<id>-<slug>`,
 * `/tv/<id>-<slug>`), or undefined for any other page. Sub-pages such as
 * `/tv/<id>/season/1` or `/movie/<id>/cast` are not title pages.
 */
export const getTmdbTitleId = (
  url: string,
): { mediaType: 'movie' | 'tv'; tmdbId: number } | undefined => {
  const match = new URL(url).pathname.match(/^\/(movie|tv)\/(\d+)(?:-[^/]*)?\/?$/);
  if (!match) return undefined;
  return { mediaType: match[1] as 'movie' | 'tv', tmdbId: parseInt(match[2], 10) };
};

const clean = (text: string | null | undefined): string | undefined => {
  const value = text?.replace(/\s+/g, ' ').trim();
  return value || undefined;
};

/**
 * Read the title on the current TMDB page: the id from the URL, the name and
 * year from the header ("Твоё имя (2016)"), else the og:title.
 */
export const readTmdbTitle = (doc: Document, url: string): TmdbTitle | undefined => {
  const id = getTmdbTitleId(url);
  if (!id) return undefined;

  const heading = doc.querySelector('section.header .title h2, .header .title h2');
  const title =
    clean(heading?.querySelector('a')?.textContent) ??
    clean(doc.querySelector('meta[property="og:title"]')?.getAttribute('content'));
  const yearText = heading?.querySelector('.release_date')?.textContent ?? '';
  const year = yearText.match(/((?:19|20)\d{2})/)?.[1];

  return { ...id, title, year: year ? parseInt(year, 10) : undefined };
};
