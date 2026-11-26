import { describe, it, expect, beforeEach } from 'vitest';
import { getKinopoiskTitleId, kinopoiskQueries, readKinopoiskTitle } from './kinopoisk-page.js';

const ld = (data: Record<string, unknown>): string =>
  `<script type="application/ld+json">${JSON.stringify(data)}</script>`;

describe('getKinopoiskTitleId', () => {
  it.each([
    ['https://www.kinopoisk.ru/film/301/', { id: '301', mediaType: 'movie' }],
    ['https://www.kinopoisk.ru/film/301', { id: '301', mediaType: 'movie' }],
    ['https://www.kinopoisk.ru/series/404900/?utm_referrer=x', { id: '404900', mediaType: 'tv' }],
  ])('reads %s', (url, expected) => {
    expect(getKinopoiskTitleId(url)).toEqual(expected);
  });

  it.each([
    'https://www.kinopoisk.ru/',
    'https://www.kinopoisk.ru/film/301/cast/',
    'https://www.kinopoisk.ru/name/7836/',
    'https://www.kinopoisk.ru/lists/movies/top250/',
  ])('ignores %s', (url) => {
    expect(getKinopoiskTitleId(url)).toBeUndefined();
  });
});

describe('readKinopoiskTitle', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('reads a film with its original title', () => {
    document.head.innerHTML = ld({
      '@type': 'Movie',
      name: 'Матрица',
      alternateName: 'The Matrix',
      datePublished: '1999',
      url: 'https://www.kinopoisk.ru/film/301/',
    });

    expect(readKinopoiskTitle(document, 'https://www.kinopoisk.ru/film/301/')).toEqual({
      id: '301',
      mediaType: 'movie',
      title: 'Матрица',
      originalTitle: 'The Matrix',
      year: 1999,
    });
  });

  it('reads a series', () => {
    document.head.innerHTML = ld({
      '@type': 'TVSeries',
      name: 'Во все тяжкие',
      alternateName: 'Breaking Bad',
      datePublished: '2008',
      url: 'https://www.kinopoisk.ru/series/404900/',
    });

    expect(readKinopoiskTitle(document, 'https://www.kinopoisk.ru/series/404900/')).toMatchObject({
      mediaType: 'tv',
      originalTitle: 'Breaking Bad',
      year: 2008,
    });
  });

  it('has no original title for a Russian film', () => {
    document.head.innerHTML = ld({
      '@type': 'Movie',
      name: 'Брат',
      datePublished: '1997',
      url: 'https://www.kinopoisk.ru/film/41519/',
    });

    const title = readKinopoiskTitle(document, 'https://www.kinopoisk.ru/film/41519/')!;
    expect(title.originalTitle).toBeUndefined();
    expect(kinopoiskQueries(title)).toEqual(['Брат']);
  });

  it('waits while the JSON-LD still describes the previous title', () => {
    document.head.innerHTML =
      ld({ '@type': 'BreadcrumbList' }) +
      ld({
        '@type': 'Movie',
        name: 'Брат',
        datePublished: '1997',
        url: 'https://www.kinopoisk.ru/film/41519/',
      });

    expect(readKinopoiskTitle(document, 'https://www.kinopoisk.ru/film/41520/')).toBeUndefined();
  });
});

describe('kinopoiskQueries', () => {
  it('searches the original title first, then the Russian one', () => {
    expect(
      kinopoiskQueries({
        id: '301',
        mediaType: 'movie',
        title: 'Матрица',
        originalTitle: 'The Matrix',
      }),
    ).toEqual(['The Matrix', 'Матрица']);
  });
});
