import { describe, it, expect, beforeEach } from 'vitest';
import { getTmdbTitleId, readTmdbTitle } from './tmdb-page.js';

describe('getTmdbTitleId', () => {
  it.each([
    [
      'https://www.themoviedb.org/movie/372058-kimi-no-na-wa',
      { mediaType: 'movie', tmdbId: 372058 },
    ],
    ['https://www.themoviedb.org/movie/372058', { mediaType: 'movie', tmdbId: 372058 }],
    [
      'https://www.themoviedb.org/tv/220542-kusuriya-no-hitorigoto?language=ru-RU',
      { mediaType: 'tv', tmdbId: 220542 },
    ],
  ])('reads %s', (url, expected) => {
    expect(getTmdbTitleId(url)).toEqual(expected);
  });

  it.each([
    'https://www.themoviedb.org/',
    'https://www.themoviedb.org/movie',
    'https://www.themoviedb.org/tv/220542-kusuriya-no-hitorigoto/season/1',
    'https://www.themoviedb.org/movie/372058-kimi-no-na-wa/cast',
    'https://www.themoviedb.org/person/1245-scarlett-johansson',
  ])('ignores %s', (url) => {
    expect(getTmdbTitleId(url)).toBeUndefined();
  });
});

describe('readTmdbTitle', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('reads the name and year from the header', () => {
    document.body.innerHTML = `
      <section class="header poster"><div class="title ott_true">
        <h2 class="8">
          <a href="/movie/372058">Твоё имя</a>
          <span class="tag release_date">(2016)</span>
        </h2>
      </div></section>`;

    expect(
      readTmdbTitle(document, 'https://www.themoviedb.org/movie/372058-kimi-no-na-wa'),
    ).toEqual({
      mediaType: 'movie',
      tmdbId: 372058,
      title: 'Твоё имя',
      year: 2016,
    });
  });

  it('falls back to og:title without a header', () => {
    document.head.innerHTML = '<meta property="og:title" content="Монолог фармацевта" />';

    expect(readTmdbTitle(document, 'https://www.themoviedb.org/tv/220542')).toEqual({
      mediaType: 'tv',
      tmdbId: 220542,
      title: 'Монолог фармацевта',
      year: undefined,
    });
  });

  it('returns undefined off title pages', () => {
    expect(
      readTmdbTitle(document, 'https://www.themoviedb.org/tv/220542/season/1'),
    ).toBeUndefined();
  });
});
