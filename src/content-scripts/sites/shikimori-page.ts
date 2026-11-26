/**
 * Reading Shikimori anime pages (shikimori.io; shikimori.one and shiki.one
 * redirect there). Pure functions over the URL and the DOM, so both the
 * detector and the card code can use them.
 */

/** `movie` and `tv` map to Jellyseerr's media types; OVA, ONA, specials and the rest don't. */
export type ShikimoriKind = 'movie' | 'tv' | 'other';

export interface ShikimoriAnime {
  readonly id: string;
  readonly kind: ShikimoriKind;
  readonly russian?: string;
  /** Shikimori's main name: the romanized Japanese title ("Kusuriya no Hitorigoto"). */
  readonly romaji?: string;
  readonly english?: string;
  readonly year?: number;
}

export interface ShikimoriSearch {
  /** Titles to search Jellyseerr with, best first. */
  readonly queries: string[];
  readonly mediaType?: 'movie' | 'tv';
  readonly year?: number;
  /** What the card calls the title when nothing is found. */
  readonly displayTitle: string;
}

/**
 * The anime id of a Shikimori anime page, or undefined for any other page.
 * Pages are `/animes/<id>-<slug>`; some ids carry a letter prefix
 * (`/animes/z32182-mob-psycho-100`), which is dropped. Sub-pages such as
 * `/animes/<id>/characters` are not title pages.
 */
export const getShikimoriAnimeId = (url: string): string | undefined => {
  const match = new URL(url).pathname.match(/^\/animes\/[a-z]?(\d+)(?:-[^/]*)?\/?$/);
  return match?.[1];
};

const CYRILLIC = /[Ѐ-ӿ]/;
const CJK = /[぀-ヿ㐀-鿿＀-￯]/;
const LATIN = /[A-Za-z]/;

const clean = (text: string | null | undefined): string | undefined => {
  const value = text?.replace(/\s+/g, ' ').trim();
  return value || undefined;
};

interface AnimeJsonLd {
  readonly '@type'?: string;
  readonly url?: string;
  readonly name?: string;
  readonly alternateName?: string | string[];
  readonly datePublished?: string;
}

/**
 * The page's JSON-LD for this anime. Shikimori navigates with Turbolinks,
 * which keeps the previous pages' JSON-LD in <head>, so the entry is picked
 * by its URL rather than by position.
 */
const findJsonLd = (doc: Document, id: string): AnimeJsonLd | undefined => {
  for (const script of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      const data = JSON.parse(script.textContent ?? '') as AnimeJsonLd;
      if (data.url && getShikimoriAnimeId(data.url) === id) return data;
    } catch {
      // Not JSON: skip.
    }
  }
  return undefined;
};

/** "Монолог фармацевта / Kusuriya no Hitorigoto": the parts around the separator. */
const readHeading = (doc: Document): string[] => {
  const h1 = doc.querySelector('h1');
  if (!h1) return [];
  const parts: string[] = [''];
  h1.childNodes.forEach((node) => {
    if (node instanceof Element && node.classList.contains('b-separator')) parts.push('');
    else parts[parts.length - 1] += node.textContent ?? '';
  });
  return parts.map(clean).filter((part): part is string => !!part);
};

/** The "Тип:" (or "Type:") line of the info block: "TV Сериал", "Фильм", "OVA"... */
const readKind = (doc: Document, ldType: string | undefined): ShikimoriKind => {
  for (const line of Array.from(doc.querySelectorAll('.b-entry-info .line'))) {
    const key = clean(line.querySelector('.key')?.textContent)?.toLowerCase();
    if (key !== 'тип:' && key !== 'type:') continue;
    const value = clean(line.querySelector('.value')?.textContent) ?? '';
    if (/фильм|movie/i.test(value)) return 'movie';
    if (/спешл|special/i.test(value)) return 'other';
    if (/^tv\b|сериал|series/i.test(value)) return 'tv';
    return 'other';
  }
  if (ldType === 'Movie') return 'movie';
  return ldType === 'TVSeries' ? 'tv' : 'other';
};

/** Read the anime on the current Shikimori page, or undefined when it is not an anime page. */
export const readShikimoriAnime = (doc: Document, url: string): ShikimoriAnime | undefined => {
  const id = getShikimoriAnimeId(url);
  if (!id) return undefined;

  const ld = findJsonLd(doc, id);
  const alternates = [ld?.alternateName ?? []].flat().map(clean).filter(Boolean) as string[];
  const heading = readHeading(doc);

  const russian =
    heading.find((part) => CYRILLIC.test(part)) ?? alternates.find((name) => CYRILLIC.test(name));
  const romaji = clean(ld?.name) ?? heading.find((part) => !CYRILLIC.test(part));
  const english = alternates.find(
    (name) => LATIN.test(name) && !CYRILLIC.test(name) && !CJK.test(name) && name !== romaji,
  );
  const yearMatch = ld?.datePublished?.match(/^(\d{4})/);

  if (!russian && !romaji && !english) return undefined;
  return {
    id,
    kind: readKind(doc, ld?.['@type']),
    russian,
    romaji,
    english,
    year: yearMatch ? parseInt(yearMatch[1], 10) : undefined,
  };
};

/**
 * Sequel and side-story markers. Shikimori lists every season, OVA and special
 * as its own entry, while TMDB (and so Jellyseerr) has one show with seasons.
 */
const LATIN_SEQUEL_MARKERS = [
  // "Shingeki no Kyojin: The Final Season Part 2"
  /\s*:?\s+(?:The\s+)?Final\s+Season\b.*$/i,
  // "Kusuriya no Hitorigoto 2nd Season", "... 3rd Season Part 2", "... Season 2"
  /\s+(?:\d+(?:st|nd|rd|th)\s+Season|Season\s+\d+)\b.*$/i,
  /\s+Part\s+\d+$/i,
  // "Mob Psycho 100 II"
  /\s+(?:II|III|IV|V|VI|VII|VIII|IX|X)$/,
  // "Shingeki no Kyojin OVA", "Attack on Titan OAD"
  /\s+(?:OVA|OAD|ONA|Specials?)$/i,
];

/** Strip the sequel markers from a romaji or English title. */
export const stripLatinSequel = (title: string): { title: string; stripped: boolean } => {
  let current = title;
  let stripped = false;
  for (let changed = true; changed; ) {
    changed = false;
    for (const marker of LATIN_SEQUEL_MARKERS) {
      const next = current.replace(marker, '').trim();
      if (next && next !== current) {
        current = next;
        stripped = changed = true;
      }
    }
  }
  return { title: current, stripped };
};

/**
 * Strip the season number from a Russian title of a sequel: "Монолог
 * фармацевта 2", "Монолог фармацевта 3. Часть 2", "Моб Психо 100 2". Only
 * used when the Latin title shows it is a sequel, since a trailing number is
 * often part of the name ("Моб Психо 100").
 */
const stripRussianSequel = (title: string): string =>
  title
    .replace(/\s+(?:OVA|OAD|ONA|спешл)$/i, '')
    .replace(/\.?\s+Часть\s+\d+$/i, '')
    .replace(/\s+\d+(?:\s+сезон)?$/i, '')
    .trim() || title;

/**
 * What to search Jellyseerr with: the English title first (TMDB's own), then
 * the romaji and the Russian ones. For a sequel or an OVA the markers are
 * stripped to find the show, and its year (that of the sequel) is not sent.
 */
export const buildShikimoriSearch = (anime: ShikimoriAnime): ShikimoriSearch => {
  const english = anime.english ? stripLatinSequel(anime.english) : undefined;
  const romaji = anime.romaji ? stripLatinSequel(anime.romaji) : undefined;
  const isSequel = !!english?.stripped || !!romaji?.stripped;
  const russian = anime.russian && isSequel ? stripRussianSequel(anime.russian) : anime.russian;

  const queries = [english?.title, romaji?.title, russian].filter(
    (query, index, all): query is string => !!query && all.indexOf(query) === index,
  );

  return {
    queries,
    mediaType: anime.kind === 'other' ? undefined : anime.kind,
    year: isSequel ? undefined : anime.year,
    displayTitle: anime.russian ?? anime.romaji ?? anime.english ?? queries[0] ?? '',
  };
};
