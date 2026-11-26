/**
 * Reading TheTVDB (thetvdb.com) series and movie pages. Pure functions over
 * the URL and the DOM, so both the detector and the card code can use them.
 */

export interface TvdbTitle {
  readonly mediaType: 'movie' | 'tv';
  /** The page's link to TMDB, when TVDB has one: the id Jellyseerr works with. */
  readonly tmdbId?: number;
  /** The title as the page shows it (TVDB's translation, usually English). */
  readonly title?: string;
  readonly year?: number;
}

/**
 * The media type of a TVDB series or movie page (`/series/<slug>`,
 * `/movies/<slug>`), or undefined for any other page, season and episode
 * pages included.
 */
export const getTvdbPageType = (url: string): 'movie' | 'tv' | undefined => {
  const match = new URL(url).pathname.match(/^\/(series|movies)\/[^/]+\/?$/);
  if (!match) return undefined;
  return match[1] === 'movies' ? 'movie' : 'tv';
};

const clean = (text: string | null | undefined): string | undefined => {
  const value = text?.replace(/\s+/g, ' ').trim();
  return value || undefined;
};

/**
 * Read the title on the current TVDB page: the type from the URL, the TMDB id
 * from the "TheMovieDB" link of the basic info, the name from the heading
 * and the year from "First Aired" (series) or the first "Released" line
 * (movies).
 */
export const readTvdbTitle = (doc: Document, url: string): TvdbTitle | undefined => {
  const mediaType = getTvdbPageType(url);
  if (!mediaType) return undefined;

  const tmdbPath = mediaType === 'movie' ? 'movie' : 'tv';
  let tmdbId: number | undefined;
  for (const link of Array.from(
    doc.querySelectorAll<HTMLAnchorElement>('a[href*="themoviedb.org/"]'),
  )) {
    const match = link.href.match(new RegExp(`themoviedb\\.org/${tmdbPath}/(\\d+)`));
    if (match) {
      tmdbId = parseInt(match[1], 10);
      break;
    }
  }

  let year: number | undefined;
  for (const item of Array.from(doc.querySelectorAll('.list-group-item'))) {
    const text = clean(item.textContent) ?? '';
    // The label and the date sit in separate elements, often with no space between.
    if (!/^(First Aired|Released)/i.test(text)) continue;
    const match = text.match(/(?:^|\D)((?:19|20)\d{2})(?!\d)/);
    if (match) {
      year = parseInt(match[1], 10);
      break;
    }
  }

  return {
    mediaType,
    tmdbId,
    title: clean(doc.querySelector('#series_title, h1')?.textContent),
    year,
  };
};
