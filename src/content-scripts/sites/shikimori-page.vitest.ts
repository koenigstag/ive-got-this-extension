import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildShikimoriSearch,
  getShikimoriAnimeId,
  readShikimoriAnime,
  stripLatinSequel,
  type ShikimoriAnime,
} from './shikimori-page.js';

/** The parts of a Shikimori anime page the reader looks at, as the site renders them. */
const renderPage = ({
  url,
  ldType = 'TVSeries',
  name,
  alternateName,
  datePublished,
  heading,
  kind,
}: {
  url: string;
  ldType?: string;
  name: string;
  alternateName: string[];
  datePublished?: string;
  heading: [string, string] | [string];
  kind?: string;
}): void => {
  const ld = {
    '@context': 'https://schema.org',
    '@type': ldType,
    name,
    url,
    alternateName,
    datePublished,
  };
  document.head.innerHTML = `<script type="application/ld+json">${JSON.stringify(ld)}</script>`;
  const h1 =
    heading.length === 2
      ? `${heading[0]} <span class="b-separator inline">/</span> ${heading[1]}`
      : heading[0];
  document.body.innerHTML = `
    <header><h1>
      ${h1}
    </h1></header>
    <div class="b-db_entry"><div class="c-about"><div class="c-info-left"><div class="b-entry-info">
      ${kind ? `<div class="line-container"><div class="line"><div class="key">Тип:</div><div class="value">${kind}</div></div></div>` : ''}
    </div></div></div></div>`;
};

describe('getShikimoriAnimeId', () => {
  it.each([
    ['https://shikimori.io/animes/54492-kusuriya-no-hitorigoto', '54492'],
    ['https://shikimori.io/animes/54492', '54492'],
    ['https://shikimori.one/animes/z32182-mob-psycho-100/', '32182'],
  ])('reads %s', (url, id) => {
    expect(getShikimoriAnimeId(url)).toBe(id);
  });

  it.each([
    'https://shikimori.io/animes',
    'https://shikimori.io/animes/kind/tv',
    'https://shikimori.io/animes/54492-kusuriya-no-hitorigoto/characters',
    'https://shikimori.io/mangas/107489-kusuriya-no-hitorigoto',
  ])('ignores %s', (url) => {
    expect(getShikimoriAnimeId(url)).toBeUndefined();
  });
});

describe('readShikimoriAnime', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('reads a TV series', () => {
    const url = 'https://shikimori.io/animes/54492-kusuriya-no-hitorigoto';
    renderPage({
      url,
      name: 'Kusuriya no Hitorigoto',
      alternateName: ['Монолог фармацевта', 'The Apothecary Diaries', '薬屋のひとりごと'],
      datePublished: '2023-10-22',
      heading: ['Монолог фармацевта', 'Kusuriya no Hitorigoto'],
      kind: 'TV Сериал',
    });

    expect(readShikimoriAnime(document, url)).toEqual({
      id: '54492',
      kind: 'tv',
      russian: 'Монолог фармацевта',
      romaji: 'Kusuriya no Hitorigoto',
      english: 'The Apothecary Diaries',
      year: 2023,
    });
  });

  it('reads a movie and an OVA by the type line', () => {
    const movieUrl = 'https://shikimori.io/animes/32281-kimi-no-na-wa';
    renderPage({
      url: movieUrl,
      ldType: 'Movie',
      name: 'Kimi no Na wa.',
      alternateName: ['Твоё имя', 'Your Name.', '君の名は。'],
      datePublished: '2016-08-26',
      heading: ['Твоё имя', 'Kimi no Na wa.'],
      kind: 'Фильм',
    });
    expect(readShikimoriAnime(document, movieUrl)).toMatchObject({ kind: 'movie', year: 2016 });

    const ovaUrl = 'https://shikimori.io/animes/18397-shingeki-no-kyojin-ova';
    renderPage({
      url: ovaUrl,
      name: 'Shingeki no Kyojin OVA',
      alternateName: ['Атака титанов OVA', 'Attack on Titan OAD', '進撃の巨人ＯＡＤ'],
      heading: ['Атака титанов OVA', 'Shingeki no Kyojin OVA'],
      kind: 'OVA',
    });
    expect(readShikimoriAnime(document, ovaUrl)).toMatchObject({ kind: 'other' });
  });

  it('falls back to the JSON-LD type without a type line', () => {
    const url = 'https://shikimori.io/animes/32281-kimi-no-na-wa';
    renderPage({
      url,
      ldType: 'Movie',
      name: 'Kimi no Na wa.',
      alternateName: ['Твоё имя', 'Your Name.'],
      heading: ['Твоё имя', 'Kimi no Na wa.'],
    });
    expect(readShikimoriAnime(document, url)?.kind).toBe('movie');
  });

  it('takes the JSON-LD of this page when Turbolinks kept older ones', () => {
    const url = 'https://shikimori.io/animes/32281-kimi-no-na-wa';
    renderPage({
      url,
      ldType: 'Movie',
      name: 'Kimi no Na wa.',
      alternateName: ['Твоё имя', 'Your Name.'],
      datePublished: '2016-08-26',
      heading: ['Твоё имя', 'Kimi no Na wa.'],
      kind: 'Фильм',
    });
    const stale = document.createElement('script');
    stale.type = 'application/ld+json';
    stale.textContent = JSON.stringify({
      '@type': 'TVSeries',
      url: 'https://shikimori.io/animes/54492-kusuriya-no-hitorigoto',
      name: 'Kusuriya no Hitorigoto',
      alternateName: ['The Apothecary Diaries'],
      datePublished: '2023-10-22',
    });
    document.head.prepend(stale);

    expect(readShikimoriAnime(document, url)).toMatchObject({
      romaji: 'Kimi no Na wa.',
      english: 'Your Name.',
      year: 2016,
    });
  });

  it('works from the heading alone', () => {
    const url = 'https://shikimori.io/animes/54492-kusuriya-no-hitorigoto';
    document.body.innerHTML =
      '<h1>Монолог фармацевта <span class="b-separator inline">/</span> Kusuriya no Hitorigoto</h1>';
    expect(readShikimoriAnime(document, url)).toEqual({
      id: '54492',
      kind: 'other',
      russian: 'Монолог фармацевта',
      romaji: 'Kusuriya no Hitorigoto',
      english: undefined,
      year: undefined,
    });
  });

  it('returns undefined off anime pages', () => {
    document.body.innerHTML = '<h1>Аниме</h1>';
    expect(readShikimoriAnime(document, 'https://shikimori.io/animes')).toBeUndefined();
  });
});

describe('stripLatinSequel', () => {
  it.each([
    ['Kusuriya no Hitorigoto 2nd Season', 'Kusuriya no Hitorigoto'],
    ['Kusuriya no Hitorigoto 3rd Season Part 2', 'Kusuriya no Hitorigoto'],
    ['The Apothecary Diaries Season 2', 'The Apothecary Diaries'],
    ['Shingeki no Kyojin: The Final Season Part 2', 'Shingeki no Kyojin'],
    ['Mob Psycho 100 II', 'Mob Psycho 100'],
    ['Attack on Titan OAD', 'Attack on Titan'],
  ])('%s → %s', (title, expected) => {
    expect(stripLatinSequel(title)).toEqual({ title: expected, stripped: true });
  });

  it.each(['Mob Psycho 100', 'Kimi no Na wa.', 'Kusuriya no Hitorigoto Movie: Bouhi no Hihou'])(
    'keeps %s',
    (title) => {
      expect(stripLatinSequel(title)).toEqual({ title, stripped: false });
    },
  );
});

describe('buildShikimoriSearch', () => {
  const anime = (overrides: Partial<ShikimoriAnime>): ShikimoriAnime => ({
    id: '1',
    kind: 'tv',
    ...overrides,
  });

  it('searches English, romaji, then Russian, with the type and year', () => {
    expect(
      buildShikimoriSearch(
        anime({
          russian: 'Монолог фармацевта',
          romaji: 'Kusuriya no Hitorigoto',
          english: 'The Apothecary Diaries',
          year: 2023,
        }),
      ),
    ).toEqual({
      queries: ['The Apothecary Diaries', 'Kusuriya no Hitorigoto', 'Монолог фармацевта'],
      mediaType: 'tv',
      year: 2023,
      displayTitle: 'Монолог фармацевта',
    });
  });

  it('looks for the show behind a sequel, without the sequel year', () => {
    expect(
      buildShikimoriSearch(
        anime({
          russian: 'Монолог фармацевта 3. Часть 2',
          romaji: 'Kusuriya no Hitorigoto 3rd Season Part 2',
          year: 2027,
        }),
      ),
    ).toEqual({
      queries: ['Kusuriya no Hitorigoto', 'Монолог фармацевта'],
      mediaType: 'tv',
      year: undefined,
      displayTitle: 'Монолог фармацевта 3. Часть 2',
    });
  });

  it('keeps a number that belongs to the name', () => {
    expect(
      buildShikimoriSearch(
        anime({
          russian: 'Моб Психо 100 2',
          romaji: 'Mob Psycho 100 II',
          english: 'Mob Psycho 100 II',
        }),
      ).queries,
    ).toEqual(['Mob Psycho 100', 'Моб Психо 100']);
    expect(
      buildShikimoriSearch(
        anime({ russian: 'Моб Психо 100', romaji: 'Mob Psycho 100', year: 2016 }),
      ).queries,
    ).toEqual(['Mob Psycho 100', 'Моб Психо 100']);
  });

  it('sends no type for an OVA', () => {
    const search = buildShikimoriSearch(
      anime({ kind: 'other', russian: 'Атака титанов OVA', romaji: 'Shingeki no Kyojin OVA' }),
    );
    expect(search.mediaType).toBeUndefined();
    expect(search.queries).toEqual(['Shingeki no Kyojin', 'Атака титанов']);
  });
});
